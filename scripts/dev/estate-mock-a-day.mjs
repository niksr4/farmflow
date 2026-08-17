/**
 * Puts a believable day on Estate Mock, marked by hand rather than by a terminal.
 *
 * Run: node --env-file=.env.local scripts/dev/estate-mock-a-day.mjs
 *
 * Eight of ten present, each on their own job, most on their home estate and two sent across to
 * the other -- because moving people between estates is the pattern the whole design had to
 * accommodate, and a demo where nobody moves proves nothing. One person splits the day across two
 * blocks, the contract gang works as a crew, and two people are simply absent.
 *
 * Everything goes through the real endpoints, so the presence-before-allocation rule and the
 * rate guard both apply exactly as they would to a manager doing this by hand.
 */

import { chromium } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const today = new Date().toISOString().slice(0, 10)

// A clean day: this replaces whatever was on it, including the punches earlier runs left.
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
await sql`DELETE FROM attendance_records WHERE tenant_id=${T} AND attendance_date=${today}::date`

const workers = await sql`
  SELECT id, full_name, kind, headcount, estate, daily_rate
  FROM attendance_workers WHERE tenant_id=${T} AND active ORDER BY full_name`
const blocks = Object.fromEntries(
  (await sql`SELECT code, id, name, estate FROM locations WHERE tenant_id=${T}`).map((b) => [b.code, b]),
)
const codeName = Object.fromEntries(
  (await sql`SELECT code, activity FROM account_activities WHERE tenant_id=${T}`).map((c) => [c.code, c.activity]),
)

const page = await (await (await chromium.launch()).newContext()).newPage()
page.setDefaultTimeout(90000)
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await page.locator('button[type="submit"]:not([disabled])').waitFor()
await page.click('button[type="submit"]')
await page.waitForURL(/dashboard/, { timeout: 90000 }).catch(() => {})

// Two people did not come in. Everyone else is marked by hand, the way an estate with no
// terminal does it -- one save for the whole roll.
const absent = new Set([workers[3].id, workers[6].id])
const present = workers.filter((w) => !absent.has(w.id))
const put = await page.request.put(`${BASE}/api/attendance`, {
  data: { date: today, presentWorkerIds: present.map((w) => w.id) },
})
console.log(`\nmarked by hand: ${present.length} of ${workers.length} present (${put.status()})`)
console.log(`  absent today : ${workers.filter((w) => absent.has(w.id)).map((w) => w.full_name).join(", ")}`)

// Home estate for most, two sent across, one split day. Hill blocks are HF/MV/PG; the rest are
// Valley, which is where the crossing shows up.
const plan = [
  { w: 0, jobs: [["140", "HF", 1]] },
  { w: 1, jobs: [["140", "HF", 1]] },
  { w: 2, jobs: [["131", "MV", 1]] },
  { w: 4, jobs: [["137", "PG", 0.5], ["132", "HF", 0.5]] },
  { w: 5, jobs: [["151", "RS", 1]] },
  { w: 7, jobs: [["152", "OA", 1]] },
  { w: 8, jobs: [["182", "PL", 1]] },
  { w: 9, jobs: [["134", "HF", 1]] },
]

console.log("\nallocating:")
for (const { w, jobs } of plan) {
  const worker = workers[w]
  if (absent.has(worker.id)) continue
  for (const [code, blockCode, day] of jobs) {
    const block = blocks[blockCode]
    const res = await page.request.post(`${BASE}/api/attendance/assignments`, {
      data: { date: today, workerIds: [worker.id], activityCode: code, locationId: block.id, dayFraction: day },
    })
    const crossed = worker.estate && block.estate && worker.estate !== block.estate
    console.log(
      `  ${res.status() === 200 ? "ok  " : "FAIL"} ${String(worker.full_name).padEnd(22)} ` +
      `${codeName[code] ?? code} @ ${block.name}${day !== 1 ? ` (${day}d)` : ""}` +
      `${crossed ? `   <- ${worker.estate} worker sent to ${block.estate}` : ""}`,
    )
    if (res.status() !== 200) console.log("       ", (await res.text()).slice(0, 140))
  }
}

// Consumables the same day, against real codes and blocks, so Accounts has both sides of the
// spend rather than labour alone.
const expenses = [
  ["245", "HF", 4200, "Compost spread on the harvested rows"],
  ["219", "MV", 1850, "Lime, 8 bags"],
  ["221", "RS", 3100, "Borer spray for the Robusta"],
  ["157", "OA", 2400, "Knapsack refills"],
  ["210", "NUR", 950, "Poly bags and seed trays"],
]
console.log("\nconsumables:")
for (const [code, blockCode, amount, notes] of expenses) {
  const res = await page.request.post(`${BASE}/api/expenses-neon`, {
    data: { date: today, code, amount, locationId: blocks[blockCode].id, notes },
  })
  console.log(`  ${res.status() === 200 ? "ok  " : `FAIL ${res.status()}`} Rs ${amount.toLocaleString("en-IN")} ${codeName[code] ?? code} @ ${blocks[blockCode].name}`)
  if (res.status() !== 200) console.log("       ", (await res.text()).slice(0, 140))
}

console.log("\n== the day as recorded ==")
const rows = await sql`
  SELECT w.full_name, la.activity_code, aa.activity, l.name AS block, l.estate,
         la.day_fraction, la.total_cost
  FROM labour_assignments la
  JOIN attendance_workers w ON w.id = la.worker_id
  LEFT JOIN locations l ON l.id = la.location_id
  LEFT JOIN account_activities aa ON aa.code = la.activity_code AND aa.tenant_id = la.tenant_id
  WHERE la.tenant_id=${T} AND la.work_date=${today}::date
  ORDER BY w.full_name, la.created_at`
rows.forEach((r) =>
  console.log(`  ${String(r.full_name).padEnd(22)} ${String(r.activity ?? r.activity_code).padEnd(28)} ${String(r.block).padEnd(14)} ${r.day_fraction}d  Rs ${Number(r.total_cost).toLocaleString("en-IN")}`),
)
const t = await sql`
  SELECT COUNT(*)::int n, SUM(total_cost)::numeric c, SUM(day_fraction)::numeric d
  FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
const e = await sql`
  SELECT COUNT(*)::int n, COALESCE(SUM(total_amount),0)::numeric c
  FROM expense_transactions WHERE tenant_id=${T} AND entry_date=${today}::date`
console.log(`\n  labour     ${t[0].n} jobs, ${t[0].d} labourer-days, Rs ${Number(t[0].c).toLocaleString("en-IN")}`)
console.log(`  consumables ${e[0].n} entries, Rs ${Number(e[0].c).toLocaleString("en-IN")}`)
process.exit(0)
