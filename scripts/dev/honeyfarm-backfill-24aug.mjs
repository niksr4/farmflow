/**
 * Record HoneyFarm's 24 August muster from the handwritten sheet.
 *
 * Run: node --env-file=.env.local scripts/dev/honeyfarm-backfill-24aug.mjs [prod]           (dry run)
 *      node --env-file=.env.local scripts/dev/honeyfarm-backfill-24aug.mjs [prod] --commit
 *
 * WHY A SCRIPT AND NOT THE APP. Their cutover was set to 25 Aug, so the 24th falls on the legacy
 * side: the muster refuses an allocation dated before the line, and the old typed form is hidden
 * once the cutover is reached. The day is genuinely unrecordable through the UI -- not because
 * anything is broken, but because a cutover date drawn one day too late leaves exactly this gap.
 *
 * So the line moves back to 24 Aug and the day is recorded on the muster, which is where it
 * belongs: the sheet is per-person, and the typed form could only have held it as headcount-by-code
 * with the names thrown away.
 *
 * MOVING THE LINE IS SAFE HERE AND IS NOT GENERALLY SAFE. It orphans any typed row dated on or
 * after the new line: HoneyFarm has none after 22 Aug, checked. It strands any muster row dated
 * before it: their 7 existing rows are on the 25th, which stays on or after 24. Both conditions are
 * asserted below rather than assumed, because getting either wrong silently removes real spend
 * from every total.
 *
 * NAMES ARE MATCHED, NOT TRUSTED. The sheet is handwritten and spells several people differently
 * from the payroll export -- Abeya/Abeeja, Sidha/Sidda, Vjura/Vajura, Ajithali/Ajitali,
 * Chandrica/Chandrika. Every match is printed with how it was reached, and an ambiguous one stops
 * the run rather than picking a favourite. Nineteen names against a 36-person roster is exactly
 * where a confident wrong match hides.
 *
 * THE BLOCK IS NOT GUESSED. The sheet records who did what, not where. Everything goes to
 * "Honeyfarm (general)", which is where 97% of their historical labour sits and which honestly
 * means "this estate, no particular block". KAB allocated his own 25 Aug rows to HF A/C; if he
 * knows where the 24th's work happened he can change it per row, and that is a better outcome than
 * me inventing a block for nineteen people.
 */
import { neon } from "@neondatabase/serverless"

const isProd = process.argv.includes("prod")
const commit = process.argv.includes("--commit")
const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)

const DATE = "2026-08-24"
const NEW_CUTOVER = "2026-08-24"

/** Straight off the sheet, spellings and all. */
const SHEET = [
  ["Chandra", "211"], ["Chandrica", "181"], ["Sara", "181"], ["Radha", "139"],
  ["Seethu", "139"], ["Sabiya", "139"], ["Tangamma", "139"], ["Sidha", "211"],
  ["Rathna", "139"], ["Aminul", "151"], ["Ajithali", "139"], ["Margina", "139"],
  ["Makusali", "151"], ["Akashali", "139"], ["Abeya", "139"], ["Ishak", "139"],
  ["Vjura", "139"], ["Akibul", "211"], ["Kajolly", "139"],
]

const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, "")

/** Levenshtein, for deciding whether "Abeya" is "Abeeja" or nobody. */
const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

const [tenant] = await sql`SELECT id FROM tenants WHERE name = 'HoneyFarm'`
if (!tenant) { console.error("No HoneyFarm tenant."); process.exit(1) }

// ── the two conditions that make moving the line safe ────────────────────────
const [orphan] = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
  FROM labor_transactions WHERE tenant_id = ${tenant.id} AND deployment_date >= ${NEW_CUTOVER}::date`
const [strand] = await sql`SELECT COUNT(*)::int n FROM labour_assignments
  WHERE tenant_id = ${tenant.id} AND work_date < ${NEW_CUTOVER}::date`

console.log(`\n=== ${isProd ? "PRODUCTION" : "dev"} — HoneyFarm, ${DATE} ===\n`)
console.log(`  typed rows that would be orphaned by moving the line to ${NEW_CUTOVER}: ${orphan.n}${orphan.n ? ` (Rs ${orphan.c})` : ""}`)
console.log(`  muster rows that would be stranded before it                        : ${strand.n}`)
if (orphan.n > 0 || strand.n > 0) {
  console.error("\nRefusing: moving the line would remove real spend from every total.")
  process.exit(1)
}

const workers = await sql`SELECT id, full_name, daily_rate, worker_type FROM attendance_workers
  WHERE tenant_id = ${tenant.id} AND active`
const [general] = await sql`SELECT id, name FROM locations
  WHERE tenant_id = ${tenant.id} AND kind = 'general' AND estate = 'Honeyfarm'`

console.log(`\n  matching ${SHEET.length} names against ${workers.length} on the roster:\n`)

/**
 * Exact names are claimed first, then the rest are matched against whoever is left.
 *
 * One person appears once on a day's muster, so a worker already matched exactly cannot also be
 * somebody else's fuzzy match. Without that, "Abeya" sat equidistant from "Abeeja" and "Sabiya" --
 * and Sabiya was already on the sheet under her own spelling. Matching against the full roster
 * every time invents competition that the sheet itself rules out.
 */
const pool = [...workers]
const results = new Map()
for (const [sheetName] of SHEET) {
  const i = pool.findIndex((w) => norm(w.full_name) === norm(sheetName))
  if (i >= 0) results.set(sheetName, { w: pool[i], how: "exact" }), pool.splice(i, 1)
}
for (const [sheetName] of SHEET) {
  if (results.has(sheetName)) continue
  const target = norm(sheetName)
  const scored = pool.map((w) => ({ w, d: distance(target, norm(w.full_name)) })).sort((a, b) => a.d - b.d)
  const best = scored[0]
  const tied = scored[1] && scored[1].d === best.d
  if (!best || best.d > 3 || tied) {
    results.set(sheetName, { w: null, how: best
      ? `no confident match (best "${best.w.full_name}" distance ${best.d}${tied ? `, tied with "${scored[1].w.full_name}"` : ""})`
      : "no candidates left" })
    continue
  }
  results.set(sheetName, { w: best.w, how: `distance ${best.d}` })
  pool.splice(pool.indexOf(best.w), 1)
}

const matched = []
let failed = 0
for (const [sheetName, code] of SHEET) {
  const { w, how } = results.get(sheetName)
  if (!w) { console.log(`    ${sheetName.padEnd(12)} -> ${how}`); failed += 1; continue }
  if (!(Number(w.daily_rate) > 0)) {
    console.log(`    ${sheetName.padEnd(12)} -> ${w.full_name} has no daily rate (${w.worker_type}) — skipped`)
    failed += 1; continue
  }
  console.log(`    ${sheetName.padEnd(12)} -> ${w.full_name.padEnd(12)} code ${code}  Rs ${w.daily_rate}  (${how})`)
  matched.push({ worker: w, code })
}

const total = matched.reduce((s, m) => s + Number(m.worker.daily_rate), 0)
console.log(`\n  ${matched.length} matched, ${failed} not recorded`)
console.log(`  day total: Rs ${total.toLocaleString("en-IN")}`)
console.log(`  block    : ${general?.name ?? "(none found)"} — the sheet does not say, so it is not guessed`)
console.log(`  absent   : ${workers.length - matched.length} of ${workers.length} on the roster`)

if (!commit) { console.log("\nDry run. Re-run with --commit to write.\n"); process.exit(0) }
if (failed > 0) { console.error("\nRefusing to write a partial day. Resolve the unmatched names first.\n"); process.exit(1) }

await sql`UPDATE tenant_labour_entry_mode SET assignments_from = ${NEW_CUTOVER}::date, set_by = 'honeyfarm-backfill-24aug.mjs'
          WHERE tenant_id = ${tenant.id}`

// Re-runnable. The first attempt died partway through -- one attendance row written, no
// allocations -- because total_cost is a GENERATED column and the insert tried to supply it.
// Clearing the day first means a retry cannot double-count; attendance uses ON CONFLICT because
// a biometric punch could legitimately already own that row.
await sql`DELETE FROM labour_assignments WHERE tenant_id = ${tenant.id} AND work_date = ${DATE}::date`

for (const m of matched) {
  await sql`INSERT INTO attendance_records (tenant_id, worker_id, attendance_date, marked_by, source)
            VALUES (${tenant.id}, ${m.worker.id}, ${DATE}::date, 'sheet 24 Aug', 'manual')
            ON CONFLICT (tenant_id, worker_id, attendance_date) DO NOTHING`
  // total_cost is omitted on purpose: it is generated as
  // COALESCE(lump_sum, rate * headcount * day_fraction * pay_multiplier + charges), so it can
  // never disagree with the parts it is made of. Supplying it is rejected outright, which is the
  // right way for that invariant to be enforced.
  await sql`INSERT INTO labour_assignments
              (tenant_id, worker_id, work_date, activity_code, location_id, day_fraction, rate, headcount, pay_multiplier, recorded_by)
            VALUES (${tenant.id}, ${m.worker.id}, ${DATE}::date, ${m.code}, ${general?.id ?? null},
                    1, ${m.worker.daily_rate}, 1, 1, 'sheet 24 Aug')`
}

const [after] = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
  FROM labour_assignments WHERE tenant_id = ${tenant.id} AND work_date = ${DATE}::date`
const [lc] = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
  FROM labour_cost WHERE tenant_id = ${tenant.id} AND work_date = ${DATE}::date`
console.log(`\nWRITTEN. ${after.n} allocations on ${DATE}, Rs ${Number(after.c).toLocaleString("en-IN")}`)
console.log(`  labour_cost now counts that day: ${lc.n} rows, Rs ${Number(lc.c).toLocaleString("en-IN")}`)
console.log(`  cutover moved to ${NEW_CUTOVER}\n`)
