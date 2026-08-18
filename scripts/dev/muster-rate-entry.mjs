/**
 * Where a deployment's cost comes from, now that the rate belongs to the work.
 *
 * Run: node --env-file=.env.local scripts/dev/muster-rate-entry.mjs
 *
 * A worker has a daily wage and that prices an ordinary day. Work that pays differently is priced
 * on the day it happens, rather than kept in a rate table that would be stale more often than
 * right. A holiday doubles the money and leaves the day at one. A gang is paid for who actually
 * turned up, plus whatever else that day needed.
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
// Work is not priced in advance any more: the daily wage is the base and anything unusual is
// typed on the day. So the wage is what these cases are built on.
await sql`UPDATE attendance_workers SET daily_rate = 700 WHERE tenant_id=${T} AND kind IS DISTINCT FROM 'gang'`
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

console.log("\n== the daily wage prices an ordinary day ==")
await allocate({ workerIds: [individual.id], activityCode: code, locationId: null, dayFraction: 1 })
check(await costOf(individual.id) === 700, `full day on a Rs 700 wage cost Rs ${await costOf(individual.id)}`)

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

console.log("\n== typing an amount prices one day without changing the wage ==")
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND worker_id=${individual.id}`
await allocate({ workerIds: [individual.id], activityCode: code, locationId: null, dayFraction: 1, rate: 950 })
check(await costOf(individual.id) === 950, `override cost Rs ${await costOf(individual.id)}`)
const stillSeven = Number((await sql`SELECT daily_rate FROM attendance_workers WHERE id=${individual.id}`)[0].daily_rate)
check(stillSeven === 700, `their wage is still Rs ${stillSeven}`)

if (gang) {
  console.log("\n== a gang is paid for who turned up, plus the day's extras ==")
  await allocate({
    workerIds: [gang.id], activityCode: code, locationId: null, dayFraction: 1,
    headcount: 8, driverCharge: 500, supervisorCharge: 300, vehicleCharge: null,
  })
  const g = (await sql`SELECT total_cost, headcount FROM labour_assignments WHERE tenant_id=${T} AND worker_id=${gang.id} ORDER BY created_at DESC LIMIT 1`)[0]
  check(Number(g.headcount) === 8, `booked ${gang.headcount}, paid for ${g.headcount}`)
  // Priced off the gang's own wage, not the individuals' -- read it rather than assume it.
  const gangWage = Number((await sql`SELECT daily_rate FROM attendance_workers WHERE id=${gang.id}`)[0].daily_rate)
  check(
    Number(g.total_cost) === gangWage * 8 + 500 + 300,
    `Rs ${g.total_cost} = 8 x ${gangWage} + 500 driver + 300 supervisor, no vehicle`,
  )
}

console.log("\n== a worker with no wage is refused rather than costed at zero ==")
{
  await sql`UPDATE attendance_workers SET daily_rate = NULL WHERE tenant_id=${T} AND id=${individual.id}`
  const res = await allocate({ workerIds: [individual.id], activityCode: code, locationId: null, dayFraction: 1 })
  const body = await res.json().catch(() => ({}))
  check(res.status() === 409, `refused with ${res.status()}`)
  check(/no daily wage/i.test(body.error || ""), `message names both ways to fix it: "${String(body.error).slice(0, 90)}..."`)
  await sql`UPDATE attendance_workers SET daily_rate = 700 WHERE tenant_id=${T} AND id=${individual.id}`
}

console.log("\n== two jobs in one day come to exactly one day's wage ==")
// Half of the wage, twice. This is the case the owner asked about directly.
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
const other = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} AND code <> ${code} ORDER BY code LIMIT 1`)[0].code
await allocate({ workerIds: [individual.id], activityCode: code, locationId: null, dayFraction: 0.5 })
await allocate({ workerIds: [individual.id], activityCode: other, locationId: null, dayFraction: 0.5 })
const split = await sql`SELECT COUNT(*)::int n, SUM(total_cost)::numeric c, SUM(day_fraction)::numeric d
                        FROM labour_assignments WHERE tenant_id=${T} AND worker_id=${individual.id}`
check(Number(split[0].n) === 2, `two jobs recorded`)
check(Number(split[0].c) === 700, `Rs 350 + Rs 350 = Rs ${split[0].c}, one day's wage`)
check(Number(split[0].d) === 1, `and the day sums to ${split[0].d}, not 2`)

await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${today}::date`
console.log(failures === 0 ? "\nPASS -- the daily wage prices the day, and anything unusual is typed on it\n" : `\n${failures} FAILURE(S)\n`)
process.exit(failures === 0 ? 0 : 1)
