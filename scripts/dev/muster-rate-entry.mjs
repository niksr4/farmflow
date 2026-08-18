/**
 * Where a deployment's cost comes from, now that the rate belongs to the work.
 *
 * Run: node --env-file=.env.local scripts/dev/muster-rate-entry.mjs
 *
 * The rate is the code's, prefilled so nobody types it twice a morning, and overridable on a
 * single entry because one day is occasionally not like the others. A holiday doubles the money
 * and leaves the day at one. A gang is paid for who actually turned up, plus whatever else that
 * day needed.
 */

import { chromium } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const today = new Date().toISOString().slice(0, 10)
let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const page = await (await (await chromium.launch()).newContext()).newPage()
page.setDefaultTimeout(90000)
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").fill("estate_mock")
await page.locator("input#password").fill("MorningFlow!2026")
await page.locator('button[type="submit"]:not([disabled])').waitFor()
await page.click('button[type="submit"]')
await page.waitForURL(/dashboard/, { timeout: 90000 }).catch(() => {})

const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code
await sql`UPDATE account_activities SET default_rate = 700 WHERE tenant_id=${T} AND code=${code}`
const individual = (await sql`SELECT id, full_name FROM attendance_workers WHERE tenant_id=${T} AND active AND kind <> 'gang' ORDER BY full_name LIMIT 1`)[0]
const gang = (await sql`SELECT id, full_name, headcount FROM attendance_workers WHERE tenant_id=${T} AND active AND kind='gang' LIMIT 1`)[0]

await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
await page.request.put(`${BASE}/api/attendance`, {
  data: { date: today, presentWorkerIds: [individual.id, gang.id].filter(Boolean) },
})

const allocate = (data) => page.request.post(`${BASE}/api/attendance/assignments`, { data: { date: today, ...data } })
const costOf = async (workerId) =>
  Number((await sql`SELECT total_cost, rate, headcount, day_fraction, pay_multiplier
                    FROM labour_assignments WHERE tenant_id=${T} AND worker_id=${workerId}
                    ORDER BY created_at DESC LIMIT 1`)[0]?.total_cost)

console.log("\n== the rate comes from the work, not the person ==")
await allocate({ workerIds: [individual.id], activityCode: code, locationId: null, dayFraction: 1 })
check(await costOf(individual.id) === 700, `full day on a Rs 700 code cost Rs ${await costOf(individual.id)}`)

console.log("\n== half a day halves it ==")
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND worker_id=${individual.id}`
await allocate({ workerIds: [individual.id], activityCode: code, locationId: null, dayFraction: 0.5 })
check(await costOf(individual.id) === 350, `half day cost Rs ${await costOf(individual.id)}`)

console.log("\n== a holiday doubles the money, not the day ==")
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND worker_id=${individual.id}`
await allocate({ workerIds: [individual.id], activityCode: code, locationId: null, dayFraction: 1, payMultiplier: 2 })
const hol = (await sql`SELECT total_cost, day_fraction FROM labour_assignments WHERE tenant_id=${T} AND worker_id=${individual.id}`)[0]
check(Number(hol.total_cost) === 1400, `holiday cost Rs ${hol.total_cost}`)
check(Number(hol.day_fraction) === 1, `and the block was still charged ${hol.day_fraction} labour-day, not 2`)

console.log("\n== an override prices one entry without changing the code ==")
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND worker_id=${individual.id}`
await allocate({ workerIds: [individual.id], activityCode: code, locationId: null, dayFraction: 1, rate: 950 })
check(await costOf(individual.id) === 950, `override cost Rs ${await costOf(individual.id)}`)
const stillSeven = Number((await sql`SELECT default_rate FROM account_activities WHERE tenant_id=${T} AND code=${code}`)[0].default_rate)
check(stillSeven === 700, `the code itself is still Rs ${stillSeven}`)

if (gang) {
  console.log("\n== a gang is paid for who turned up, plus the day's extras ==")
  await allocate({
    workerIds: [gang.id], activityCode: code, locationId: null, dayFraction: 1,
    headcount: 8, driverCharge: 500, supervisorCharge: 300, vehicleCharge: null,
  })
  const g = (await sql`SELECT total_cost, headcount FROM labour_assignments WHERE tenant_id=${T} AND worker_id=${gang.id} ORDER BY created_at DESC LIMIT 1`)[0]
  check(Number(g.headcount) === 8, `booked ${gang.headcount}, paid for ${g.headcount}`)
  check(Number(g.total_cost) === 700 * 8 + 500 + 300, `Rs ${g.total_cost} = 8 x 700 + 500 driver + 300 supervisor, no vehicle`)
}

console.log("\n== work with no rate is refused rather than costed at zero ==")
const noRate = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} AND default_rate IS NULL LIMIT 1`)[0]
if (noRate) {
  await sql`UPDATE attendance_workers SET daily_rate = NULL WHERE tenant_id=${T} AND id=${individual.id}`
  const res = await allocate({ workerIds: [individual.id], activityCode: noRate.code, locationId: null, dayFraction: 1 })
  const body = await res.json().catch(() => ({}))
  check(res.status() === 409, `refused with ${res.status()}`)
  check(/no rate set/i.test(body.error || ""), `message names the work: "${String(body.error).slice(0, 70)}"`)
  await sql`UPDATE attendance_workers SET daily_rate = 600 WHERE tenant_id=${T} AND id=${individual.id}`
}

await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
console.log(failures === 0 ? "\nPASS -- the work carries the rate, and the cost is visible before it is saved\n" : `\n${failures} FAILURE(S)\n`)
process.exit(failures === 0 ? 0 : 1)
