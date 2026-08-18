/**
 * Both ways of taking a muster have to work: a fingerprint terminal, or a person tapping names.
 *
 * Run: node --env-file=.env.local scripts/dev/muster-manual-and-scanner.mjs
 *
 * Most estates have no scanner, and the ones that do still mark the people it missed by hand --
 * a worker with no finger enrolled, a new hire, a day the terminal was down. So the manual path
 * is not a fallback to be tolerated, it is the common case, and allocation has to work
 * identically from either. The two must also mix on one day without either overwriting the other.
 */

import { chromium, devices } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const OUT = "/private/tmp/claude-502/-Users-nikhilchengappa-FarmFlow-farmflow-farmflow/30f77264-d2b5-4ed3-84b3-563966358905/scratchpad"
const SERIAL = "AMDB25062800863"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const today = new Date().toISOString().slice(0, 10)

let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

await sql`DELETE FROM labour_assignments WHERE tenant_id=${T}`
await sql`DELETE FROM attendance_records WHERE tenant_id=${T}`

// Everyone needs a rate or allocation is refused, by design.
await sql`UPDATE attendance_workers SET daily_rate = COALESCE(daily_rate, 600) WHERE tenant_id=${T}`

const browser = await chromium.launch()
const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage()
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 20 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 20 })
await page.click('button[type="submit"]')
await page.waitForLoadState("networkidle", { timeout: 30000 })

const roster = await sql`SELECT id, full_name, device_user_code FROM attendance_workers
                         WHERE tenant_id=${T} AND active ORDER BY full_name`
const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code
const block = (await sql`SELECT id FROM locations WHERE tenant_id=${T} ORDER BY name LIMIT 1`)[0].id

const enrolled = roster.filter((w) => w.device_user_code)
const notEnrolled = roster.filter((w) => !w.device_user_code)

console.log("\n== 1. scanner: a punch puts someone on the roll with nobody signed in ==")
await fetch(`${BASE}/iclock/cdata?SN=${SERIAL}&table=ATTLOG`, {
  method: "POST", headers: { "Content-Type": "text/plain" },
  body: `${enrolled[0].device_user_code}\t${today} 07:40:00\t0\t1`,
})
await new Promise((r) => setTimeout(r, 800))
let rows = await sql`SELECT worker_id, source FROM attendance_records WHERE tenant_id=${T} AND attendance_date=${today}::date`
check(rows.length === 1 && rows[0].source === "biometric", `${enrolled[0].full_name} marked present by the terminal (source=${rows[0]?.source})`)

console.log("\n== 2. manual: marking by hand puts someone else on the same day ==")
const byHand = notEnrolled[0] || roster[roster.length - 1]
await page.request.put(`${BASE}/api/attendance`, {
  data: { date: today, presentWorkerIds: [rows[0].worker_id, byHand.id] },
})
rows = await sql`SELECT worker_id, source FROM attendance_records WHERE tenant_id=${T} AND attendance_date=${today}::date`
const sources = Object.fromEntries(rows.map((r) => [r.worker_id, r.source]))
check(rows.length === 2, `two on the roll: one punched, one marked by hand (${rows.length})`)
check(sources[byHand.id] === "manual", `${byHand.full_name} recorded as manual`)

console.log("\n== 3. a manual save does not overwrite the punch ==")
const punch = await sql`SELECT check_in_time, source FROM attendance_records
                        WHERE tenant_id=${T} AND attendance_date=${today}::date AND worker_id=${rows[0].worker_id}`
const stillBiometric = await sql`SELECT source, check_in_time FROM attendance_records
  WHERE tenant_id=${T} AND attendance_date=${today}::date AND worker_id=${enrolled[0].id}`
check(stillBiometric[0]?.source === "biometric", "the punched row kept source=biometric after a manual save")
check(Boolean(stillBiometric[0]?.check_in_time), "the punched row kept its check-in time")

console.log("\n== 4. allocation works the same from either ==")
for (const w of [enrolled[0], byHand]) {
  const res = await page.request.post(`${BASE}/api/attendance/assignments`, {
    data: { date: today, workerIds: [w.id], activityCode: code, locationId: block, dayFraction: 1 },
  })
  check(res.status() === 200, `allocated ${w.full_name} (${w.device_user_code ? "scanner" : "by hand"}): ${res.status()}`)
}
const cost = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
                       FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
check(Number(cost[0].n) === 2 && Number(cost[0].c) > 0, `both cost money: ${cost[0].n} rows, Rs ${Number(cost[0].c).toLocaleString("en-IN")}`)

console.log("\n== 5. work with no rate is refused rather than costing nothing ==")
// The rate belongs to the task now, so it is the code that has to be unpriced. Clearing a
// person's rate proves nothing any more -- nothing reads it while the work carries a rate.
const spare = roster.find((w) => w.id !== enrolled[0].id && w.id !== byHand.id)
const pricedBefore = (await sql`SELECT default_rate FROM account_activities WHERE tenant_id=${T} AND code=${code}`)[0]?.default_rate ?? null
await sql`UPDATE account_activities SET default_rate = NULL WHERE tenant_id=${T} AND code=${code}`
await sql`UPDATE attendance_workers SET daily_rate = NULL WHERE id=${spare.id}`
await page.request.put(`${BASE}/api/attendance`, {
  data: { date: today, presentWorkerIds: [enrolled[0].id, byHand.id, spare.id] },
})
const noRate = await page.request.post(`${BASE}/api/attendance/assignments`, {
  data: { date: today, workerIds: [spare.id], activityCode: code, locationId: block, dayFraction: 1 },
})
const noRateBody = await noRate.json().catch(() => ({}))
check(noRate.status() === 409, `refused with 409 (got ${noRate.status()})`)
check(/no daily wage and .* has no rate/i.test(noRateBody.error || ""), `message names the worker and the work: "${String(noRateBody.error).slice(0, 80)}..."`)
await sql`UPDATE account_activities SET default_rate = ${pricedBefore} WHERE tenant_id=${T} AND code=${code}`
await sql`UPDATE attendance_workers SET daily_rate = 600 WHERE id=${spare.id}`

console.log("\n== 6. the UI shows both, and says which is which ==")
await page.goto(`${BASE}/dashboard?tab=attendance`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(4000)
const body = await page.locator("body").innerText()
check(/07:40/.test(body), "the punch time is shown for the scanned worker")
check(new RegExp(byHand.full_name.split(" ")[0], "i").test(body), `${byHand.full_name} appears on the roll`)
await page.screenshot({ path: `${OUT}/manual-and-scanner.png`, fullPage: true })

await sql`DELETE FROM labour_assignments WHERE tenant_id=${T}`
console.log(failures === 0 ? "\nPASS -- scanner and by-hand both work, and mix on one day\n" : `\n${failures} FAILURE(S)\n`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
