/**
 * The window between announcing a cutover and it arriving must leave a working way to record labour.
 *
 * Run: node --env-file=.env.local scripts/dev/cutover-window.mjs
 *
 * Medappa hit this: the cutover row was written on the 18th for the 19th, which took the Accounts
 * form away immediately while the muster was still being ignored by every cost reader. A whole
 * evening with no way to record labour, and a plausible action -- allocate on the muster now --
 * that would have saved and counted nowhere.
 */
import { neon } from "@neondatabase/serverless"
import { chromium } from "@playwright/test"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id

let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const iso = (d) => d.toISOString().slice(0, 10)
const today = iso(new Date())
const tomorrow = iso(new Date(Date.now() + 864e5))
const yesterday = iso(new Date(Date.now() - 864e5))

// Put Estate Mock in the announced-but-not-arrived state.
const prior = await sql`SELECT assignments_from::text d FROM tenant_labour_entry_mode WHERE tenant_id=${T}`
await sql`DELETE FROM tenant_labour_entry_mode WHERE tenant_id=${T}`
await sql`INSERT INTO tenant_labour_entry_mode (tenant_id, assignments_from, set_by)
          VALUES (${T}, ${tomorrow}::date, 'cutover-window-harness')`
console.log(`\nEstate Mock: cutover announced for ${tomorrow}, today is ${today}\n`)

const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 20 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 20 })
await page.click('button[type="submit"]')
await page.waitForLoadState("networkidle", { timeout: 30000 })

const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code
const block = (await sql`SELECT id FROM locations WHERE tenant_id=${T} ORDER BY name LIMIT 1`)[0].id
const worker = (await sql`SELECT id FROM attendance_workers WHERE tenant_id=${T} AND active ORDER BY full_name LIMIT 1`)[0].id
await sql`UPDATE attendance_workers SET daily_rate=COALESCE(daily_rate,600) WHERE tenant_id=${T}`

console.log("== 1. before the cutover, the Accounts form still accepts today's labour ==")
const legacy = await page.request.post(`${BASE}/api/labor-neon`, {
  data: { date: today, code, reference: "cutover window test", laborEntries: [{ name: "In-house", laborers: 1, costPerLabor: 500 }], notes: "harness" },
})
check(legacy.status() === 200, `accepted an entry dated today (${legacy.status()})`)

console.log("\n== 2. before the cutover, a muster allocation for today is REFUSED ==")
await page.request.put(`${BASE}/api/attendance`, { data: { date: today, presentWorkerIds: [worker] } })
// Count before and after: this tenant may already hold rows for today from other harnesses, and
// asserting an absolute zero would fail on their account rather than on this request's.
const rowsBefore = Number((await sql`SELECT COUNT(*)::int n FROM labour_assignments
                                     WHERE tenant_id=${T} AND work_date=${today}::date`)[0].n)
const early = await page.request.post(`${BASE}/api/attendance/assignments`, {
  data: { date: today, workerIds: [worker], activityCode: code, locationId: block, dayFraction: 1 },
})
const earlyBody = await early.json().catch(() => ({}))
check(early.status() === 409, `refused with 409 rather than saving uncounted (${early.status()})`)
check(/would not be counted|Costs instead/i.test(earlyBody.error || ""), `says why: "${String(earlyBody.error).slice(0, 80)}..."`)
const rowsAfter = Number((await sql`SELECT COUNT(*)::int n FROM labour_assignments
                                    WHERE tenant_id=${T} AND work_date=${today}::date`)[0].n)
check(rowsAfter === rowsBefore, `wrote nothing: ${rowsBefore} rows before, ${rowsAfter} after`)

console.log("\n== 3. a back-dated allocation is refused too ==")
const back = await page.request.post(`${BASE}/api/attendance/assignments`, {
  data: { date: yesterday, workerIds: [worker], activityCode: code, locationId: block, dayFraction: 1 },
})
check(back.status() === 409, `refused (${back.status()})`)

console.log("\n== 4. on and after the cutover, allocation works ==")
await sql`UPDATE tenant_labour_entry_mode SET assignments_from=${today}::date WHERE tenant_id=${T}`
await page.request.put(`${BASE}/api/attendance`, { data: { date: today, presentWorkerIds: [worker] } })
const ok = await page.request.post(`${BASE}/api/attendance/assignments`, {
  data: { date: today, workerIds: [worker], activityCode: code, locationId: block, dayFraction: 1 },
})
check(ok.status() === 200, `allocated once the cutover has arrived (${ok.status()})`)
const counted = await sql`SELECT COALESCE(SUM(total_cost),0)::numeric c FROM labour_cost
                          WHERE tenant_id=${T} AND work_date=${today}::date AND source='assignment'`
check(Number(counted[0].c) > 0, `and it reaches labour_cost: Rs ${Number(counted[0].c).toLocaleString("en-IN")}`)

// Restore.
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
await sql`DELETE FROM labor_transactions WHERE tenant_id=${T} AND notes='harness'`
await sql`DELETE FROM tenant_labour_entry_mode WHERE tenant_id=${T}`
if (prior.length) {
  await sql`INSERT INTO tenant_labour_entry_mode (tenant_id, assignments_from, set_by)
            VALUES (${T}, ${prior[0].d}::date, 'restored-by-harness')`
}

console.log(failures === 0 ? "\nPASS -- the announcement window always has exactly one working way to record labour\n" : `\n${failures} FAILURE(S)\n`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
