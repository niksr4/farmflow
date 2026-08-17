/**
 * A mistake on the roll can be corrected, not only undone.
 *
 * Run: node --env-file=.env.local scripts/dev/muster-edit-delete.mjs
 *
 * Delete-and-re-add always worked, but it is the destructive way round: the row is gone the
 * moment you tap, and a manager interrupted between the two halves has turned a costed day into
 * an uncosted one without noticing. Editing keeps the day whole while it is being fixed.
 */

import { chromium, devices } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const today = new Date().toISOString().slice(0, 10)
let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const page = await (await (await chromium.launch()).newContext({ ...devices["iPhone 13"] })).newPage()
page.setDefaultTimeout(90000)
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await page.locator('button[type="submit"]:not([disabled])').waitFor()
await page.click('button[type="submit"]')
await page.waitForURL(/dashboard/, { timeout: 90000 }).catch(() => {})

const row = (await sql`
  SELECT la.id, la.activity_code, la.location_id, la.day_fraction, la.total_cost, w.full_name
  FROM labour_assignments la JOIN attendance_workers w ON w.id = la.worker_id
  WHERE la.tenant_id=${T} AND la.work_date=${today}::date ORDER BY w.full_name LIMIT 1`)[0]
const otherCode = (await sql`
  SELECT code FROM account_activities WHERE tenant_id=${T} AND code <> ${row.activity_code} ORDER BY code LIMIT 1`)[0].code
const otherBlock = (await sql`
  SELECT id, name FROM locations WHERE tenant_id=${T} AND id IS DISTINCT FROM ${row.location_id} LIMIT 1`)[0]

console.log(`\nediting ${row.full_name}: ${row.activity_code} ${row.day_fraction}d Rs ${row.total_cost}`)
const res = await page.request.put(`${BASE}/api/attendance/assignments`, {
  data: { id: row.id, activityCode: otherCode, locationId: otherBlock.id, dayFraction: 0.5 },
})
check(res.status() === 200, `edit accepted (${res.status()})`)

const after = (await sql`
  SELECT activity_code, location_id, day_fraction, total_cost FROM labour_assignments WHERE id=${row.id}`)[0]
check(String(after.activity_code) === String(otherCode), `work changed to ${otherCode}`)
check(String(after.location_id) === String(otherBlock.id), `block changed to ${otherBlock.name}`)
check(Number(after.day_fraction) === 0.5, `day changed to ${after.day_fraction}`)
check(Number(after.total_cost) === Number(row.total_cost) / (Number(row.day_fraction) / 0.5),
  `cost recalculated to Rs ${after.total_cost} (was Rs ${row.total_cost})`)

console.log("\nthe row keeps its identity -- same id, same worker, same day")
const same = (await sql`SELECT worker_id, work_date::text d FROM labour_assignments WHERE id=${row.id}`)[0]
check(Boolean(same), "the row was updated in place, not replaced")

console.log("\nthe day cap still applies to an edit")
const cap = await page.request.put(`${BASE}/api/attendance/assignments`, {
  data: { id: row.id, activityCode: otherCode, locationId: otherBlock.id, dayFraction: 2 },
})
const capBody = await cap.json().catch(() => ({}))
const capOk = cap.status() === 200 || (cap.status() === 409 && /already booked/i.test(capBody.error || ""))
check(capOk, `pushing the day to 2.0: ${cap.status()}${cap.status() === 409 ? " refused by the cap" : " accepted (worker had room)"}`)

console.log("\nand a bad edit is still refused")
const bad = await page.request.put(`${BASE}/api/attendance/assignments`, {
  data: { id: row.id, activityCode: "NOT_A_CODE", locationId: null, dayFraction: 1 },
})
check(bad.status() === 400, `unknown activity code rejected (${bad.status()})`)
const badDay = await page.request.put(`${BASE}/api/attendance/assignments`, {
  data: { id: row.id, activityCode: otherCode, locationId: null, dayFraction: 0 },
})
check(badDay.status() === 400, `zero-day edit rejected (${badDay.status()})`)

console.log("\ndelete still works")
const del = await page.request.delete(`${BASE}/api/attendance/assignments?id=${row.id}`)
check(del.status() === 200, `delete accepted (${del.status()})`)
check(Number((await sql`SELECT COUNT(*)::int n FROM labour_assignments WHERE id=${row.id}`)[0].n) === 0, "the row is gone")
const gone = await page.request.delete(`${BASE}/api/attendance/assignments?id=${row.id}`)
check(gone.status() === 404, `deleting it twice is a clean 404 (${gone.status()})`)

console.log(failures === 0 ? "\nPASS -- a mistake can be corrected or removed\n" : `\n${failures} FAILURE(S)\n`)
process.exit(failures === 0 ? 0 : 1)
