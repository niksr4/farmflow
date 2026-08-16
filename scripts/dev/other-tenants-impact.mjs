/**
 * What these changes do to the tenants who did NOT ask for them.
 *
 * Run: node --env-file=.env.local scripts/dev/other-tenants-impact.mjs
 *
 * Medappa asked for allocation on the muster. HoneyFarm and Laxmi did not, and neither has a
 * fingerprint terminal -- Laxmi's 45 attendance records are every one of them marked by hand. The
 * bar for them is not "the new features work", it is "nothing they already do got worse": the same
 * totals, the same muster, the same number of taps to mark five people present.
 *
 * A tenant with no cutover must be bit-identical downstream, and the roll must stay usable for a
 * tenant with no scanner, no estates, and no interest in allocating anything.
 */

import { chromium, devices } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const OUT = "/private/tmp/claude-502/-Users-nikhilchengappa-FarmFlow-farmflow-farmflow/30f77264-d2b5-4ed3-84b3-563966358905/scratchpad"
const sql = neon(process.env.DATABASE_URL_DEV)
const FY = { start: "2026-04-01", end: "2027-03-31" }

let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }
const money = (n) => "Rs " + Math.round(Number(n)).toLocaleString("en-IN")

const TENANTS = [
  { name: "HoneyFarm", user: process.env.E2E_ADMIN_USERNAME, pass: process.env.E2E_ADMIN_PASSWORD },
  { name: "Laxmi", user: "adminkuc", pass: "MusterDemo!2026" },
]

const browser = await chromium.launch()

for (const t of TENANTS) {
  console.log(`\n═════════ ${t.name} ═════════`)
  const T = (await sql`SELECT id FROM tenants WHERE name=${t.name}`)[0].id

  // Nobody has switched, so every reader must return exactly the legacy table's numbers.
  const [legacy] = await sql`
    SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c FROM labor_transactions
    WHERE tenant_id=${T} AND deployment_date >= ${FY.start}::date AND deployment_date <= ${FY.end}::date`
  const cutover = await sql`SELECT 1 FROM tenant_labour_entry_mode WHERE tenant_id=${T}`
  check(cutover.length === 0, "still on Accounts for labour -- no cutover set")

  const ctx = await browser.newContext({ ...devices["iPhone 13"] })
  const page = await ctx.newPage()
  const pageErrors = []
  page.on("pageerror", (e) => pageErrors.push(e.message))

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
  await page.locator("input#username").pressSequentially(t.user, { delay: 15 })
  await page.locator("input#password").pressSequentially(t.pass, { delay: 15 })
  for (let i = 0; i < 6; i++) {
    try { await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 12000 }); break }
    catch { await page.waitForTimeout(12000) }
  }
  await page.click('button[type="submit"]')
  await page.waitForLoadState("networkidle", { timeout: 40000 })

  const ask = async (p) => (await page.request.get(`${BASE}${p}`)).json()

  console.log("\n  -- reporting is unchanged --")
  const totals = await ask(`/api/accounts-totals?startDate=${FY.start}&endDate=${FY.end}`)
  check(Math.abs(Number(totals.laborTotal) - Number(legacy.c)) < 0.005,
    `accounts-totals ${money(totals.laborTotal)} == labor_transactions ${money(legacy.c)}`)

  const summary = await ask(`/api/labour-summary?startDate=${FY.start}&endDate=${FY.end}`)
  check(Math.abs(Number(summary.total) - Number(legacy.c)) < 0.005, `labour-summary ${money(summary.total)}`)
  check(Number(summary.source?.fromMuster ?? 0) === 0, "nothing attributed to the muster")

  const pl = await ask(`/api/season-pl?start=${FY.start}&end=${FY.end}`)
  check(Math.abs(Number(pl?.costs?.laborTotalInr) - Number(legacy.c)) < 0.005, `season-pl ${money(pl?.costs?.laborTotalInr)}`)

  // Everything else they open, just to be sure none of it 500s on the view.
  console.log("\n  -- every repointed route still answers --")
  const routes = [
    ["finance-balance-sheet", `/api/finance-balance-sheet?startDate=${FY.start}&endDate=${FY.end}`],
    ["season-summary", `/api/season-summary?fiscalYearStart=${FY.start}&fiscalYearEnd=${FY.end}`],
    ["cost-per-kg", `/api/dashboard/cost-per-kg`],
    ["estate-pulse", `/api/dashboard/estate-pulse`],
    ["reconciliation", `/api/reconciliation?startDate=${FY.start}&endDate=${FY.end}`],
    ["intelligence-brief", `/api/intelligence-brief?startDate=${FY.start}&endDate=${FY.end}`],
    ["activity-streak", `/api/activity-streak`],
    ["recent-activity", `/api/recent-activity`],
    ["dashboard/hints", `/api/dashboard/hints`],
    ["exports labour csv", `/api/exports/ops?dataset=labor&startDate=${FY.start}&endDate=${FY.end}`],
  ]
  let bad = 0
  for (const [label, path] of routes) {
    const res = await page.request.get(`${BASE}${path}`)
    if (res.status() !== 200) { bad++; console.log(`  FAIL ${res.status()} ${label}`) }
  }
  check(bad === 0, `${routes.length - bad}/${routes.length} answered 200`)

  console.log("\n  -- the muster still works for a tenant with no scanner --")
  await page.goto(`${BASE}/dashboard?tab=attendance`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(4500)

  const body = await page.locator("body").innerText()
  const workers = await sql`SELECT id, full_name FROM attendance_workers WHERE tenant_id=${T} AND active ORDER BY full_name`
  check(workers.length === 0 || new RegExp(workers[0].full_name.split(" ")[0], "i").test(body),
    workers.length ? `roster renders (${workers[0].full_name} visible)` : "no active workers to render")

  // No terminal, so none of the biometric furniture should be on screen.
  const devicesUi = await page.getByText(/fingerprint device/i).count()
  check(devicesUi === 0, `no fingerprint UI shown (found ${devicesUi})`)

  // Marking present by hand: the thing they actually do every day. Matched on the exact
  // per-worker label -- a loose /present$/ also catches "All present" and "Save - N present".
  let toggles = 0
  for (const w of workers) {
    toggles += await page.getByRole("button", { name: `${w.full_name} present`, exact: true }).count()
  }
  check(toggles === workers.length, `${toggles} presence toggles for ${workers.length} workers`)

  if (workers.length > 0) {
    // Today opens with everyone already present, so unticking one and saving must persist
    // exactly the rest. That is the whole manual workflow for an estate with no terminal.
    const day = new Date().toISOString().slice(0, 10)
    await sql`DELETE FROM attendance_records WHERE tenant_id=${T} AND attendance_date=${day}::date AND source='manual'`
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForTimeout(4000)

    await page.getByRole("button", { name: `${workers[0].full_name} present`, exact: true }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole("button", { name: /save/i }).first().click()
    await page.waitForTimeout(2500)

    const after = await sql`SELECT worker_id, source FROM attendance_records
                            WHERE tenant_id=${T} AND attendance_date=${day}::date`
    const expected = workers.length - 1
    check(after.length === expected,
      `unticked 1 of ${workers.length} and saved: ${after.length} present (expected ${expected})`)
    check(!after.some((r) => String(r.worker_id) === String(workers[0].id)),
      `${workers[0].full_name} is the one left off`)
    check(after.every((r) => r.source === "manual"), "saved as manual, not biometric")
    await sql`DELETE FROM attendance_records WHERE tenant_id=${T} AND attendance_date=${day}::date AND source='manual'`
  }

  check(pageErrors.length === 0, `no page errors (${pageErrors.slice(0, 1).join("") || "none"})`)
  await page.screenshot({ path: `${OUT}/impact-${t.name}.png`, fullPage: true })
  await ctx.close()
}

console.log(failures === 0 ? "\nNO REGRESSION for tenants who did not ask for any of this\n" : `\n${failures} PROBLEM(S)\n`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
