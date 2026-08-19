/**
 * Setting the same job for several people is one save, not one per person.
 *
 * Run: node --env-file=.env.local scripts/dev/muster-batch-allocate.mjs
 *
 * The assignments route has always taken an array of worker ids -- it dedupes them and
 * pluralises its own error messages -- but the muster only ever sent one, so a 22-person day
 * meant 22 identical trips through the same panel. Medappa's writer did exactly that on their
 * first morning.
 */
import { neon } from "@neondatabase/serverless"
import { chromium } from "@playwright/test"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const today = new Date().toISOString().slice(0, 10)
let fail = 0
const check = (ok, msg) => { if (!ok) fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

await sql`UPDATE attendance_workers SET daily_rate = COALESCE(daily_rate, 600) WHERE tenant_id=${T}`
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await p.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await p.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await p.click('button[type="submit"]')
for (let i = 0; i < 40 && !/\/dashboard/.test(p.url()); i++) await p.waitForTimeout(500)

const roster = await sql`SELECT id, full_name FROM attendance_workers WHERE tenant_id=${T} AND active ORDER BY full_name`
const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code
const block = (await sql`SELECT id FROM locations WHERE tenant_id=${T} ORDER BY name LIMIT 1`)[0].id
const group = roster.slice(0, Math.min(5, roster.length)).map((w) => w.id)

console.log(`\n== one POST, ${group.length} workers ==`)
await p.request.put(`${BASE}/api/attendance`, { data: { date: today, presentWorkerIds: group } })
const res = await p.request.post(`${BASE}/api/attendance/assignments`, {
  data: { date: today, workerIds: group, activityCode: code, locationId: block, dayFraction: 1 },
})
check(res.status() === 200, `accepted -> ${res.status()}`)

const rows = await sql`SELECT worker_id, activity_code, total_cost FROM labour_assignments
                       WHERE tenant_id=${T} AND work_date=${today}::date`
check(rows.length === group.length, `${rows.length} rows written for ${group.length} workers — one each, not one shared`)
check(new Set(rows.map((r) => r.worker_id)).size === group.length, "every row is a different worker")
check(rows.every((r) => r.activity_code === code), "all carry the same activity code")
// Costed from each worker's OWN wage, not from one rate applied to the group -- a batch shares
// the job, not the pay. Asserted against the roster's actual rates rather than a flat number,
// which is what caught this: the first draft expected 5 x Rs 600 and got Rs 3,400, because the
// people in the group are on different wages and every row had been priced correctly.
const rates = await sql`SELECT id, daily_rate FROM attendance_workers WHERE id = ANY(${group}::uuid[])`
const expected = rates.reduce((s, w) => s + Number(w.daily_rate || 0), 0)
const total = rows.reduce((s, r) => s + Number(r.total_cost), 0)
check(total === expected, `costed from each worker's own wage: Rs ${total.toLocaleString("en-IN")} (sum of their rates, not ${group.length} x one rate)`)
check(new Set(rates.map((r) => Number(r.daily_rate))).size > 1, `and the group genuinely holds mixed wages: ${[...new Set(rates.map((r) => Number(r.daily_rate)))].join(", ")}`)

console.log("\n== each row is independently editable and removable afterwards ==")
const one = rows[0]
const put = await p.request.put(`${BASE}/api/attendance/assignments`, {
  data: { id: (await sql`SELECT id FROM labour_assignments WHERE tenant_id=${T} AND worker_id=${one.worker_id} AND work_date=${today}::date`)[0].id,
          activityCode: code, locationId: block, dayFraction: 0.5 },
})
check(put.status() === 200, `edited one of the batch -> ${put.status()}`)
const edited = await sql`SELECT day_fraction, total_cost FROM labour_assignments
  WHERE tenant_id=${T} AND worker_id=${one.worker_id} AND work_date=${today}::date`
// Half of THAT worker's wage, not half of a notional 600. Same trap as the total above.
const ownRate = Number(rates.find((r) => String(r.id) === String(one.worker_id))?.daily_rate || 0)
check(Number(edited[0].day_fraction) === 0.5 && Number(edited[0].total_cost) === ownRate * 0.5,
  `that one is now a half day at Rs ${Number(edited[0].total_cost)} (half of their own Rs ${ownRate}) — the others untouched`)
const others = await sql`SELECT COUNT(*)::int n FROM labour_assignments
  WHERE tenant_id=${T} AND work_date=${today}::date AND day_fraction = 1`
check(others[0].n === group.length - 1, `${others[0].n} still full days`)

console.log("\n== absent workers cannot be swept into a batch ==")
const spare = roster.find((w) => !group.includes(w.id))
if (spare) {
  const bad = await p.request.post(`${BASE}/api/attendance/assignments`, {
    data: { date: today, workerIds: [spare.id], activityCode: code, locationId: block, dayFraction: 1 },
  })
  check(bad.status() === 409, `refused an absent worker -> ${bad.status()}`)
} else console.log("  (no spare worker to test with)")

await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
console.log(fail === 0 ? "\nPASS — one save, one row per person, each still editable\n" : `\n${fail} FAILURE(S)\n`)
await b.close()
process.exit(fail === 0 ? 0 : 1)
