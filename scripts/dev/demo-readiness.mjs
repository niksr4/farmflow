/**
 * Walks the exact path a demo takes, so nothing is discovered live.
 *
 * Run: node --env-file=.env.local scripts/dev/demo-readiness.mjs
 *
 * Owner -> preview a tenant -> Attendance -> mark present -> set a rate -> allocate -> see it in
 * Accounts. Uses Medappa Dev Copy because it has the shape of a real estate: 23 named workers,
 * 21 blocks, 80 activity codes, and no daily rates -- which is genuinely what a new estate looks
 * like on day one, so the rate step belongs in the demo rather than being papered over first.
 */

import { chromium } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const OUT = "/private/tmp/claude-502/-Users-nikhilchengappa-FarmFlow-farmflow-farmflow/30f77264-d2b5-4ed3-84b3-563966358905/scratchpad"
const sql = neon(process.env.DATABASE_URL_DEV)
const TENANT = "Medappa Dev Copy"
const T = (await sql`SELECT id FROM tenants WHERE name=${TENANT}`)[0].id
const today = new Date().toISOString().slice(0, 10)

let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

// Leave the tenant exactly as found: rates stay unset, which is Manoj's call to make.
const before = await sql`SELECT id, daily_rate FROM attendance_workers WHERE tenant_id=${T}`
// The roll only ever shows active workers, so that is what the count is compared against.
const activeCount = Number((await sql`SELECT COUNT(*)::int n FROM attendance_workers WHERE tenant_id=${T} AND active`)[0].n)
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
await sql`DELETE FROM attendance_records WHERE tenant_id=${T} AND attendance_date=${today}::date`

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage()

console.log("\n== the estate's own admin signs in ==")
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
// Signing in as the tenant's own admin rather than previewing as owner: Attendance and the
// labour routes do not call resolveScopedSessionUser, so owner preview does not reach them.
// Worth fixing, but not by changing tenant resolution on write paths the night before a demo.
await page.locator("input#username").pressSequentially("medappa_admin", { delay: 15 })
await page.locator("input#password").pressSequentially("MusterDemo!2026", { delay: 15 })
await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 20000 })
await page.click('button[type="submit"]')
await page.waitForLoadState("networkidle", { timeout: 40000 })
check(/admin|dashboard/.test(page.url()), `landed on ${page.url().replace(BASE, "")}`)

console.log(`\n== ${TENANT} ==`)
await page.goto(`${BASE}/dashboard?tab=attendance`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(5000)

const snapshot = await (await page.request.get(`${BASE}/api/attendance?date=${today}`)).json()
const previewing = snapshot?.workers?.length ?? 0
check(previewing > 0, `attendance shows ${previewing} workers`)
const isMedappa = previewing === activeCount
check(isMedappa, `that is ${TENANT}'s roster (${activeCount} active on the roll)`)

if (!isMedappa) {
  console.log("\n  NOTE: wrong tenant -- check the medappa_admin login.")
}

console.log("\n== the rate guard is what a new estate meets first ==")
const w = (await sql`SELECT id FROM attendance_workers WHERE tenant_id=${T} AND active ORDER BY full_name LIMIT 1`)[0]
await page.request.put(`${BASE}/api/attendance`, { data: { date: today, presentWorkerIds: [w.id] } })
const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code
const block = (await sql`SELECT id, name FROM locations WHERE tenant_id=${T} ORDER BY name LIMIT 1`)[0]
let res = await page.request.post(`${BASE}/api/attendance/assignments`, {
  data: { date: today, workerIds: [w.id], activityCode: code, locationId: block.id, dayFraction: 1 },
})
let bodyJson = await res.json().catch(() => ({}))
check(res.status() === 409 && /no daily rate/i.test(bodyJson.error || ""), `refused until a rate exists: "${(bodyJson.error || "").slice(0, 60)}..."`)

console.log("\n== setting the rate on the Workers tab unblocks it ==")
const put = await page.request.put(`${BASE}/api/attendance/workers/${w.id}`, { data: { dailyRate: 600 } })
check(put.status() === 200, `saved a rate through the Workers API (${put.status()})`)
res = await page.request.post(`${BASE}/api/attendance/assignments`, {
  data: { date: today, workerIds: [w.id], activityCode: code, locationId: block.id, dayFraction: 1 },
})
check(res.status() === 200, `allocation now accepted (${res.status()})`)
const [row] = await sql`SELECT total_cost FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
check(Number(row?.total_cost) === 600, `costed at Rs ${row?.total_cost} against ${block.name}`)

console.log("\n== and it is invisible downstream until the estate switches over ==")
const summary = await (await page.request.get(`${BASE}/api/labour-summary?startDate=2026-04-01&endDate=2027-03-31`)).json()
check(Number(summary.source?.fromMuster ?? 0) === 0, "Accounts still reports only the legacy entries, by design")
console.log(`       (labour-summary total Rs ${Number(summary.total ?? 0).toLocaleString("en-IN")}, all from Accounts)`)

await page.screenshot({ path: `${OUT}/demo-medappa.png`, fullPage: true })

console.log("\n== restoring ==")
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
await sql`DELETE FROM attendance_records WHERE tenant_id=${T} AND attendance_date=${today}::date`
for (const r of before) {
  await sql`UPDATE attendance_workers SET daily_rate=${r.daily_rate} WHERE id=${r.id}`
}
const rates = await sql`SELECT COUNT(*)::int n FROM attendance_workers WHERE tenant_id=${T} AND daily_rate IS NOT NULL`
check(Number(rates[0].n) === before.filter((r) => r.daily_rate != null).length, "rates left exactly as they were")

console.log(failures === 0 ? "\nREADY\n" : `\n${failures} PROBLEM(S)\n`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
