/**
 * A code is the identifier every record is filed under, so it cannot be renamed -- and a code
 * the muster is using cannot be deleted.
 *
 * Run: node --env-file=.env.local scripts/dev/activity-codes-immutable.mjs
 *
 * The rename path used to rewrite labor_transactions and expense_transactions to match, which
 * silently changed the answer to "what did this code cost last season". It also never knew about
 * labour_assignments, so on a muster tenant it orphaned every allocation. Both are checked here.
 */
import { chromium } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id

let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 20 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 20 })
await page.click('button[type="submit"]')
await page.waitForLoadState("networkidle", { timeout: 30000 })

// A code the muster is actually using. Seeded if there is none, rather than assumed: the other
// harnesses clean up their allocations, so whether this one finds a row depends on what ran
// before it -- and a test that only works in a particular order is a test that will eventually
// be believed when it is wrong.
let used = await sql`SELECT activity_code, COUNT(*)::int n FROM labour_assignments
                     WHERE tenant_id=${T} GROUP BY activity_code ORDER BY n DESC LIMIT 1`
let seeded = false
if (!used.length) {
  const w = (await sql`SELECT id FROM attendance_workers WHERE tenant_id=${T} AND active ORDER BY full_name LIMIT 1`)[0]
  const c = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0]
  const l = (await sql`SELECT id FROM locations WHERE tenant_id=${T} ORDER BY name LIMIT 1`)[0]
  const d = (await sql`SELECT COALESCE(MAX(assignments_from), CURRENT_DATE)::text v FROM tenant_labour_entry_mode WHERE tenant_id=${T}`)[0].v.slice(0,10)
  await sql`INSERT INTO labour_assignments (tenant_id, worker_id, work_date, activity_code, location_id, headcount, day_fraction, rate)
            VALUES (${T}, ${w.id}, ${d}::date, ${c.code}, ${l.id}, 1, 1, 600)`
  used = await sql`SELECT activity_code, COUNT(*)::int n FROM labour_assignments
                   WHERE tenant_id=${T} GROUP BY activity_code ORDER BY n DESC LIMIT 1`
  seeded = true
}
console.log(`\nmuster-used code: ${used[0]?.activity_code} (${used[0]?.n} allocations)\n`)

console.log("== 1. renaming a code is refused ==")
const rn = await page.request.put(`${BASE}/api/get-activity`, {
  data: { code: used[0].activity_code, nextCode: "ZZZ9", reference: "attempted rename" },
})
const rnBody = await rn.json().catch(() => ({}))
check(rn.status() === 409, `refused with 409 (got ${rn.status()})`)
check(/cannot be renamed/i.test(rnBody.error || ""), `message explains why: "${String(rnBody.error).slice(0, 70)}..."`)
const stillThere = await sql`SELECT 1 FROM account_activities WHERE tenant_id=${T} AND code=${used[0].activity_code}`
const notCreated = await sql`SELECT 1 FROM account_activities WHERE tenant_id=${T} AND code='ZZZ9'`
check(stillThere.length === 1 && notCreated.length === 0, "original code intact, no new code created")

console.log("\n== 2. the description is still editable ==")
const before = (await sql`SELECT activity FROM account_activities WHERE tenant_id=${T} AND code=${used[0].activity_code}`)[0].activity
const ed = await page.request.put(`${BASE}/api/get-activity`, {
  data: { code: used[0].activity_code, reference: before + " (edited)" },
})
check(ed.status() === 200, `description edit accepted (${ed.status()})`)
const after = (await sql`SELECT activity FROM account_activities WHERE tenant_id=${T} AND code=${used[0].activity_code}`)[0].activity
check(after === before + " (edited)", `description changed: "${after}"`)
await sql`UPDATE account_activities SET activity=${before} WHERE tenant_id=${T} AND code=${used[0].activity_code}`

console.log("\n== 3. a code the muster uses cannot be deleted ==")
const del = await page.request.delete(`${BASE}/api/get-activity?code=${encodeURIComponent(used[0].activity_code)}`)
const delBody = await del.json().catch(() => ({}))
check(del.status() === 409, `refused with 409 (got ${del.status()})`)
check(/muster/i.test(delBody.error || ""), `message names the muster: "${String(delBody.error).slice(0, 70)}..."`)
const survived = await sql`SELECT 1 FROM account_activities WHERE tenant_id=${T} AND code=${used[0].activity_code}`
check(survived.length === 1, "the code survived the delete attempt")

console.log("\n== 4. the list reports muster usage, so the UI does not offer a dead Delete ==")
const list = await page.request.get(`${BASE}/api/get-activity`)
const listBody = await list.json()
const row = (listBody.activities || []).find((a) => a.code === used[0].activity_code)
check(Number(row?.assignment_count) === used[0].n,
  `assignment_count = ${row?.assignment_count}, muster rows = ${used[0].n}`)

if (seeded) await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND activity_code=${used[0].activity_code}`
console.log(failures === 0 ? "\nPASS -- codes are stable, descriptions are not, the muster is counted\n" : `\n${failures} FAILURE(S)\n`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
