#!/usr/bin/env node
/**
 * A month of picking season at Estate Mock, and then a check that every rupee adds up.
 *
 *   node --env-file=.env.local scripts/dev/simulate-picking-season.mjs --days 26
 *   node --env-file=.env.local scripts/dev/simulate-picking-season.mjs --clean
 *
 * ⚠ DEV ONLY. There is no --prod flag on purpose. Writing a month of invented labour into a live
 * estate's books would sit inside labour_cost, the balance sheet and every payroll figure, and
 * "it was only the mock tenant" stops being true the moment somebody runs it with the wrong
 * connection string. Dev has its own Estate Mock.
 *
 * WHY THIS EXISTS. picking_records has been empty on every tenant since it was created, so the
 * whole pay-mode system -- the generated cost column, the shared day budget from scripts/152, the
 * picking arm of labour_cost, and the double-payment exclusions in payroll and reconciliation --
 * has never run against a month of real-shaped data. Unit tests cover each piece. This covers them
 * interacting, over 26 days, with the same worker picking in the morning and weeding in the
 * afternoon, which is the shape that actually breaks things.
 *
 * WHAT IT CHECKS, and each has a way of being quietly wrong:
 *
 *   1. every stored total_cost equals what lib/picking-pay.ts says it should -- the form shows one
 *      number and the P&L carries another
 *   2. no worker-day exceeds 1.0 across picking AND day-work together
 *   3. the day cap actually REFUSES an overbooking rather than silently accepting it
 *   4. labour_cost contains each picking row exactly once, to the paisa
 *   5. a day that was picked is not ALSO billed as attendance x daily_rate -- the Rs 694-for-a-
 *      Rs-200-day bug
 *   6. the grand total of the parts equals the grand total of the view
 */
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d
}
const flag = (n) => process.argv.includes(`--${n}`)

const DAYS = Number(arg("days", "26"))
const TENANT_NAME = "Estate Mock"
/** Everything this script creates carries it, so cleanup can never catch a real row. */
const TAG = "SIMSEASON"

const envValue = (name) => {
  if (process.env[name]) return process.env[name]
  try {
    const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))
    if (m) return m[1].trim().replace(/^["']|["']$/g, "")
  } catch {}
  return null
}

const url = envValue("DATABASE_URL_DEV")
if (!url) {
  console.error("No DATABASE_URL_DEV. This script is dev-only by design.")
  process.exit(1)
}
const sql = neon(url)

// ── The pay rule, imported rather than restated ───────────────────────────────────────────────
// Re-implementing it here would mean the simulation agrees with itself and proves nothing.
const { pickingRowCost } = await import("../../lib/picking-pay.ts")

const r2 = (n) => Math.round(Number(n) * 100) / 100
const money = (n) => `Rs ${r2(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Deterministic pseudo-random, so a failure can be reproduced exactly.
let seed = 20261013
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const between = (lo, hi) => lo + rnd() * (hi - lo)

const tenant = (await sql`SELECT id FROM tenants WHERE name = ${TENANT_NAME}`)[0]
if (!tenant) {
  console.error(`No tenant named "${TENANT_NAME}" on dev.`)
  process.exit(1)
}
const TID = tenant.id

// ── Clean ─────────────────────────────────────────────────────────────────────────────────────
const wipe = async () => {
  const ids = (await sql`SELECT id FROM attendance_workers WHERE tenant_id = ${TID} AND full_name LIKE ${TAG + "%"}`).map((r) => r.id)
  if (ids.length) {
    await sql`DELETE FROM picking_records     WHERE tenant_id = ${TID} AND worker_id = ANY(${ids})`
    await sql`DELETE FROM labour_assignments  WHERE tenant_id = ${TID} AND worker_id = ANY(${ids})`
    await sql`DELETE FROM attendance_records  WHERE tenant_id = ${TID} AND worker_id = ANY(${ids})`
    await sql`DELETE FROM attendance_workers  WHERE tenant_id = ${TID} AND id = ANY(${ids})`
  }
  return ids.length
}

if (flag("clean")) {
  const n = await wipe()
  console.log(`\nRemoved ${n} simulated worker(s) and everything they did.\n`)
  process.exit(0)
}

console.log(`\nPICKING SEASON SIMULATION -- ${TENANT_NAME} on dev, ${DAYS} days\n`)
const wiped = await wipe()
if (wiped) console.log(`  cleared ${wiped} worker(s) from a previous run`)

// ── The roster ────────────────────────────────────────────────────────────────────────────────
// Deliberately every shape the pay rules allow, because the interactions are what is untested.
const ROSTER = [
  /**
   * ⚠ PURE PICKERS, WHO NEVER TOUCH THE MUSTER. This is HoneyFarm's Assam crew: paid by the kilo,
   * picking every day, doing nothing else all season -- and it is the ONLY shape the double-payment
   * bug can reach.
   *
   * Payroll's attendance fallback is per WORKER over the period, not per day: `COALESCE(muster_total,
   * days_present x daily_rate)` means one muster row anywhere in the month switches the fallback off
   * for that worker entirely. The first run of this simulation gave everyone a split day eventually,
   * so every picker had some muster row, the fallback never fired, and the old query matched the new
   * one exactly -- Rs 0 difference. The simulation was passing because the data could not express
   * the bug, which is the same failure as a vacuous test.
   */
  ...Array.from({ length: 6 }, (_, i) => ({ n: `${TAG} Piece ${i + 1}`, kind: "individual", head: 1, rate: 494, mode: "piece", perKg: 4, neverSplits: true })),
  ...Array.from({ length: 4 }, (_, i) => ({ n: `${TAG} Daily ${i + 1}`, kind: "individual", head: 1, rate: 494, mode: "daily" })),
  ...Array.from({ length: 8 }, (_, i) => ({ n: `${TAG} Incentive ${i + 1}`, kind: "individual", head: 1, rate: 494, mode: "daily_plus_incentive", thr: 40, incRate: 3 })),
  { n: `${TAG} Gang A`, kind: "gang", head: 6, rate: 460, mode: "piece", perKg: 4 },
  { n: `${TAG} Gang B`, kind: "gang", head: 4, rate: 460, mode: "daily" },
  ...Array.from({ length: 5 }, (_, i) => ({ n: `${TAG} Daywork ${i + 1}`, kind: "individual", head: 1, rate: 494, mode: null })),
]

/**
 * ⚠ THE ROSTER AND THE WORK ROWS COUNT PEOPLE DIFFERENTLY, and the database enforces it:
 * attendance_workers_headcount_check requires `headcount IS NULL` for an individual and `>= 1`
 * for a gang, while picking_records.headcount is NOT NULL and defaults to 1. So an individual is
 * "null people" on the roster and "one person" on the row. Writing 1 in both places fails loudly,
 * which is the good outcome -- it is how this simulation found out rather than quietly costing
 * every individual as a crew of one and agreeing with itself.
 */
for (const w of ROSTER) {
  const rosterHeadcount = w.kind === "gang" ? w.head : null
  const rows = await sql`
    INSERT INTO attendance_workers (tenant_id, full_name, active, kind, headcount, daily_rate, worker_type)
    VALUES (${TID}, ${w.n}, TRUE, ${w.kind}, ${rosterHeadcount}, ${w.rate}, 'seasonal_assam')
    RETURNING id`
  w.id = rows[0].id
}
console.log(`  created ${ROSTER.length} workers (${ROSTER.filter((w) => w.mode).length} pick, ${ROSTER.filter((w) => !w.mode).length} day-work only)`)

// ── A month of work ───────────────────────────────────────────────────────────────────────────
const start = new Date(Date.UTC(2026, 10, 2)) // a Monday, outside any real data
const iso = (d) => d.toISOString().slice(0, 10)
const ACTIVITIES = ["140", "131", "201"]

let picks = 0
let assigns = 0
let absences = 0
const expected = [] // what WE think each picking row should cost

for (let day = 0; day < DAYS; day += 1) {
  const d = new Date(start)
  d.setUTCDate(d.getUTCDate() + day)
  if (d.getUTCDay() === 0) continue // no Sunday work
  const date = iso(d)

  for (const w of ROSTER) {
    // Roughly one day off in twelve, so absences are in the data rather than assumed away.
    if (rnd() < 0.08) { absences += 1; continue }

    await sql`
      INSERT INTO attendance_records (tenant_id, worker_id, attendance_date, source, check_in_time, marked_by)
      VALUES (${TID}, ${w.id}, ${date}::date, 'manual', ${date + "T02:35:00Z"}::timestamptz, ${TAG})`

    if (!w.mode) {
      // Day-work only: a full day on the muster.
      await sql`
        INSERT INTO labour_assignments (tenant_id, worker_id, work_date, activity_code, day_fraction, rate, headcount, recorded_by)
        VALUES (${TID}, ${w.id}, ${date}::date, ${pick(ACTIVITIES)}, 1, ${w.rate}, ${w.head}, ${TAG})`
      assigns += 1
      continue
    }

    /**
     * A third of picking days are SPLIT: half picking, half day-work. This is the case the whole
     * shared day budget exists for, and the one that produced the double-payment bug -- a worker
     * with picking AND an assignment on the same date.
     */
    const split = !w.neverSplits && rnd() < 0.33
    const pickFraction = split ? 0.5 : 1

    const kg = w.kind === "gang"
      ? r2(between(40, 90) * w.head * pickFraction)
      : r2(between(18, 85) * pickFraction)

    const row = {
      payMode: w.mode,
      kgPicked: kg,
      ratePerKg: w.mode === "piece" ? w.perKg : null,
      dayRate: w.mode === "piece" ? null : w.rate,
      headcount: w.head,
      dayFraction: pickFraction,
      incentiveThresholdKg: w.mode === "daily_plus_incentive" ? w.thr : null,
      incentiveRatePerKg: w.mode === "daily_plus_incentive" ? w.incRate : null,
    }

    const inserted = await sql`
      INSERT INTO picking_records
        (tenant_id, worker_id, pick_date, kg_picked, rate_per_kg, day_fraction, pay_mode, day_rate,
         headcount, incentive_threshold_kg, incentive_rate_per_kg, crop, notes)
      VALUES (${TID}, ${w.id}, ${date}::date, ${row.kgPicked}, ${row.ratePerKg}, ${row.dayFraction},
              ${row.payMode}, ${row.dayRate}, ${row.headcount}, ${row.incentiveThresholdKg},
              ${row.incentiveRatePerKg}, 'coffee', ${TAG})
      RETURNING id, total_cost`
    picks += 1
    expected.push({ id: inserted[0].id, ours: pickingRowCost(row), theirs: Number(inserted[0].total_cost) })

    if (split) {
      await sql`
        INSERT INTO labour_assignments (tenant_id, worker_id, work_date, activity_code, day_fraction, rate, headcount, recorded_by)
        VALUES (${TID}, ${w.id}, ${date}::date, ${pick(ACTIVITIES)}, 0.5, ${w.rate}, ${w.head}, ${TAG})`
      assigns += 1
    }
  }
}

console.log(`  wrote ${picks} picking rows, ${assigns} muster assignments, ${absences} absences\n`)

// ── The checks ────────────────────────────────────────────────────────────────────────────────
let failures = 0
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`)
  if (!ok) failures += 1
}

console.log("MATH\n")

// 1 — the form's arithmetic and the database's
const drift = expected.filter((e) => r2(e.ours) !== r2(e.theirs))
check(
  `every stored cost matches lib/picking-pay.ts (${expected.length} rows)`,
  drift.length === 0,
  drift.length ? `${drift.length} disagree, e.g. ours ${drift[0].ours} vs stored ${drift[0].theirs}` : "",
)

// 2 — nobody worked more than a day
const over = await sql`
  SELECT d.worker_id, d.day, d.used FROM (
    SELECT worker_id, work_date AS day, SUM(day_fraction) AS used FROM labour_assignments
    WHERE tenant_id = ${TID} GROUP BY 1,2
    UNION ALL
    SELECT worker_id, pick_date, SUM(day_fraction) FROM picking_records
    WHERE tenant_id = ${TID} GROUP BY 1,2
  ) x JOIN LATERAL (SELECT x.worker_id, x.day, SUM(x.used) OVER () AS used) d ON TRUE
  WHERE FALSE`
const budget = await sql`
  SELECT worker_id, day, SUM(used) AS used FROM (
    SELECT worker_id, work_date AS day, day_fraction AS used FROM labour_assignments WHERE tenant_id = ${TID}
    UNION ALL
    SELECT worker_id, pick_date,        day_fraction        FROM picking_records    WHERE tenant_id = ${TID}
  ) t GROUP BY 1,2 HAVING SUM(used) > 1.0001`
check("no worker-day exceeds 1.0 across picking and day-work", budget.length === 0, budget.length ? `${budget.length} over` : "")

// 3 — the cap REFUSES, rather than quietly accepting
const victim = ROSTER.find((w) => w.mode === "piece")
const busyDay = iso(new Date(Date.UTC(2026, 10, 3)))
let refused = false
try {
  await sql`
    INSERT INTO labour_assignments (tenant_id, worker_id, work_date, activity_code, day_fraction, rate, headcount, recorded_by)
    VALUES (${TID}, ${victim.id}, ${busyDay}::date, '140', 1, 494, 1, ${TAG + "-OVERBOOK"})`
} catch { refused = true }
if (!refused) await sql`DELETE FROM labour_assignments WHERE tenant_id = ${TID} AND recorded_by = ${TAG + "-OVERBOOK"}`
check("the day cap refuses a second full day on a day already worked", refused)

// 4 — labour_cost carries picking exactly once
const [pickSum] = await sql`SELECT COALESCE(SUM(total_cost),0) t FROM picking_records WHERE tenant_id = ${TID}`
const [viewPick] = await sql`SELECT COALESCE(SUM(total_cost),0) t FROM labour_cost WHERE tenant_id = ${TID} AND source = 'picking'`
check("labour_cost's picking arm equals the picking table, to the paisa", r2(pickSum.t) === r2(viewPick.t), `${money(pickSum.t)} vs ${money(viewPick.t)}`)

/**
 * 5 — a picked day is not ALSO billed as attendance x daily_rate.
 *
 * ⚠ THE FIRST VERSION OF THIS CHECK PASSED A LITERAL `true` AND PROVED NOTHING. It printed a
 * reassuring sentence next to a tick while asserting nothing at all -- in the one check that
 * covers the actual money bug. Caught by re-reading it, not by it failing, which is precisely why
 * a vacuous assertion is worse than a missing one.
 *
 * It now computes payroll BOTH WAYS over the whole season -- the shipped query with the picking
 * exclusion, and the old one without it -- and reports the gap. The gap is the money that would
 * have been paid for work nobody did.
 */
const payrollNow = await sql`
  WITH attendance_days AS (
    SELECT ar.worker_id, COUNT(*)::int AS days_present
    FROM attendance_records ar
    WHERE ar.tenant_id = ${TID}
      AND NOT EXISTS (
        SELECT 1 FROM picking_records pr
        WHERE pr.tenant_id = ar.tenant_id AND pr.worker_id = ar.worker_id AND pr.pick_date = ar.attendance_date)
    GROUP BY ar.worker_id
  ),
  muster AS (SELECT worker_id, SUM(total_cost) t FROM labour_assignments WHERE tenant_id = ${TID} GROUP BY 1),
  picking AS (SELECT worker_id, SUM(total_cost) t FROM picking_records   WHERE tenant_id = ${TID} GROUP BY 1)
  SELECT COALESCE(SUM(
    COALESCE(p.t, 0) + COALESCE(m.t, COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0))
  ), 0) AS net
  FROM attendance_workers w
  LEFT JOIN attendance_days a ON a.worker_id = w.id
  LEFT JOIN muster  m ON m.worker_id = w.id
  LEFT JOIN picking p ON p.worker_id = w.id
  WHERE w.tenant_id = ${TID} AND w.full_name LIKE ${TAG + "%"}`

const payrollOld = await sql`
  WITH attendance_days AS (
    SELECT ar.worker_id, COUNT(*)::int AS days_present
    FROM attendance_records ar WHERE ar.tenant_id = ${TID} GROUP BY ar.worker_id
  ),
  muster AS (SELECT worker_id, SUM(total_cost) t FROM labour_assignments WHERE tenant_id = ${TID} GROUP BY 1),
  picking AS (SELECT worker_id, SUM(total_cost) t FROM picking_records   WHERE tenant_id = ${TID} GROUP BY 1)
  SELECT COALESCE(SUM(
    COALESCE(p.t, 0) + COALESCE(m.t, COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0))
  ), 0) AS net
  FROM attendance_workers w
  LEFT JOIN attendance_days a ON a.worker_id = w.id
  LEFT JOIN muster  m ON m.worker_id = w.id
  LEFT JOIN picking p ON p.worker_id = w.id
  WHERE w.tenant_id = ${TID} AND w.full_name LIKE ${TAG + "%"}`

const now = Number(payrollNow[0].net)
const old = Number(payrollOld[0].net)
const overpay = r2(old - now)

// The truth payroll must agree with: every rupee of picking, plus every rupee of day-work, and
// nothing else. Workers who never picked still earn their attendance days.
const [truth] = await sql`
  SELECT COALESCE((SELECT SUM(total_cost) FROM picking_records WHERE tenant_id = ${TID}), 0)
       + COALESCE((SELECT SUM(total_cost) FROM labour_assignments WHERE tenant_id = ${TID}), 0) AS t`

check(
  "payroll pays each picked day once, not twice",
  r2(now) === r2(truth.t),
  `payroll ${money(now)} vs work actually done ${money(truth.t)}`,
)
check(
  "and the old query would have overpaid",
  overpay > 0,
  `old ${money(old)} -> new ${money(now)}, avoided ${money(overpay)} of phantom wages`,
)

// 6 — the parts equal the whole
const [assignSum] = await sql`SELECT COALESCE(SUM(total_cost),0) t FROM labour_assignments WHERE tenant_id = ${TID}`
const [viewAll] = await sql`SELECT COALESCE(SUM(total_cost),0) t FROM labour_cost WHERE tenant_id = ${TID}`
const [viewAssign] = await sql`SELECT COALESCE(SUM(total_cost),0) t FROM labour_cost WHERE tenant_id = ${TID} AND source = 'assignment'`
const [viewTxn] = await sql`SELECT COALESCE(SUM(total_cost),0) t FROM labour_cost WHERE tenant_id = ${TID} AND source = 'transaction'`
check(
  "picking + assignments + legacy = labour_cost total",
  r2(Number(viewPick.t) + Number(viewAssign.t) + Number(viewTxn.t)) === r2(viewAll.t),
  `${money(viewPick.t)} + ${money(viewAssign.t)} + ${money(viewTxn.t)} = ${money(viewAll.t)}`,
)
check("the assignment arm equals the assignments table", r2(assignSum.t) === r2(viewAssign.t), `${money(assignSum.t)} vs ${money(viewAssign.t)}`)

// ── What the season cost ──────────────────────────────────────────────────────────────────────
const [kg] = await sql`SELECT COALESCE(SUM(kg_picked),0) k FROM picking_records WHERE tenant_id = ${TID}`
const byMode = await sql`
  SELECT pay_mode, COUNT(*)::int n, COALESCE(SUM(kg_picked),0) kg, COALESCE(SUM(total_cost),0) cost
  FROM picking_records WHERE tenant_id = ${TID} GROUP BY 1 ORDER BY 1`
console.log("\nTHE SEASON\n")
byMode.forEach((m) => console.log(`  ${String(m.pay_mode).padEnd(21)} ${String(m.n).padStart(4)} rows  ${String(r2(m.kg)).padStart(9)} kg  ${money(m.cost)}`))
console.log(`  ${"".padEnd(21)} ${String(picks).padStart(4)} rows  ${String(r2(kg.k)).padStart(9)} kg  ${money(pickSum.t)}`)
console.log(`\n  day-work on the muster                            ${money(assignSum.t)}`)
console.log(`  TOTAL LABOUR                                      ${money(viewAll.t)}`)
console.log(`  cost per kg picked                                ${money(Number(pickSum.t) / Number(kg.k))}`)

console.log(failures === 0 ? "\n✓ ALL CHECKS PASS\n" : `\n✗ ${failures} CHECK(S) FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
