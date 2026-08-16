/**
 * Nobody gets deployed on a day they were not there.
 *
 * Run: node --env-file=.env.local scripts/dev/muster-absent-rule.mjs
 *
 * Checks the rule where it actually has to hold -- the API -- as well as in the UI. Hiding the
 * control is a courtesy; an assignment is a payable, so the server is what has to refuse.
 */

import { chromium, devices } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const OUT = "/private/tmp/claude-502/-Users-nikhilchengappa-FarmFlow-farmflow-farmflow/30f77264-d2b5-4ed3-84b3-563966358905/scratchpad"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const today = new Date().toISOString().slice(0, 10)

// Empty day: nobody punched, nobody allocated.
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T}`
await sql`DELETE FROM attendance_records WHERE tenant_id=${T}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices["iPhone 13"] })
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 20 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 20 })
await page.click('button[type="submit"]')
await page.waitForLoadState("networkidle", { timeout: 30000 })
await page.goto(`${BASE}/dashboard?tab=attendance`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(5000)

let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const worker = (await sql`
  SELECT id, full_name FROM attendance_workers
  WHERE tenant_id=${T} AND active ORDER BY full_name LIMIT 1`)[0]
const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code

console.log("\n== the API refuses an absent worker ==")
const post = async () =>
  page.request.post(`${BASE}/api/attendance/assignments`, {
    data: { date: today, workerIds: [worker.id], activityCode: code, locationId: null, dayFraction: 1 },
  })

let res = await post()
let body = await res.json().catch(() => ({}))
check(res.status() === 409, `absent worker rejected with 409 (got ${res.status()})`)
check(/not marked present/i.test(body.error || ""), `message names the fix: "${body.error || ""}"`)
check(
  Number((await sql`SELECT COUNT(*)::int n FROM labour_assignments WHERE tenant_id=${T}`)[0].n) === 0,
  "nothing was written",
)

console.log("\n== the same call succeeds once they are on the muster ==")
await page.request.put(`${BASE}/api/attendance`, { data: { date: today, presentWorkerIds: [worker.id] } })
res = await post()
check(res.status() === 200, `present worker accepted (got ${res.status()})`)
check(
  Number((await sql`SELECT COUNT(*)::int n FROM labour_assignments WHERE tenant_id=${T}`)[0].n) === 1,
  "the assignment was written",
)

console.log("\n== the UI ==")
await page.reload({ waitUntil: "domcontentloaded" })
await page.waitForTimeout(4000)

const absentHints = await page.getByText("Mark present to set work").count()
check(absentHints > 0, `absent rows say "Mark present to set work" (${absentHints} of them)`)

// The one present worker is the only row offering the control.
const triggers = await page.getByRole("button", { name: /set work|add another job/i }).count()
check(triggers === 1, `only the present worker can be allocated (${triggers} trigger${triggers === 1 ? "" : "s"})`)

// Un-ticking someone who has work must be refused rather than stranding the payable.
await page.getByRole("button", { name: `${worker.full_name} present` }).first().click()
await page.waitForTimeout(800)
const toast = await page.getByText(/remove their work first/i).count()
check(toast > 0, "un-ticking a worker who has work is refused, with the reason")

await page.screenshot({ path: `${OUT}/absent-rule.png`, fullPage: true })
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T}`

console.log(failures === 0 ? "\nPASS\n" : `\n${failures} FAILURE(S)\n`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
