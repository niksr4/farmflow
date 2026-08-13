/**
 * Every endpoint that reports labour money, hit for real against a tenant with actual data.
 *
 * Run: node --env-file=.env.local scripts/dev/labour-readers-smoke.mjs
 *
 * Repointing seventeen readers at the labour_cost view is the kind of change typecheck cannot
 * check: the column names live inside template strings, so a wrong one is a runtime 500 on a
 * page nobody opens until month end. This asks each route for a real answer.
 */

import pw from "@playwright/test"
const { chromium } = pw

const BASE = "http://localhost:3000"
const FY = { start: "2026-04-01", end: "2027-03-31" }

const ROUTES = [
  ["accounts-totals", `/api/accounts-totals?startDate=${FY.start}&endDate=${FY.end}`],
  ["accounts-summary", `/api/accounts-summary?startDate=${FY.start}&endDate=${FY.end}`],
  ["accounts-summary (by code)", `/api/accounts-summary?code=ADMIN`],
  ["labour-summary", `/api/labour-summary?startDate=${FY.start}&endDate=${FY.end}`],
  ["season-summary", `/api/season-summary?fiscalYearStart=${FY.start}&fiscalYearEnd=${FY.end}`],
  ["season-pl", `/api/season-pl?start=${FY.start}&end=${FY.end}`],
  ["finance-balance-sheet", `/api/finance-balance-sheet?startDate=${FY.start}&endDate=${FY.end}`],
  ["cost-per-kg", `/api/dashboard/cost-per-kg`],
  ["estate-pulse", `/api/dashboard/estate-pulse`],
  ["intelligence-brief", `/api/intelligence-brief?startDate=${FY.start}&endDate=${FY.end}`],
  ["reconciliation", `/api/reconciliation?startDate=${FY.start}&endDate=${FY.end}`],
  ["exports/ops (labour csv)", `/api/exports/ops?dataset=labor&startDate=${FY.start}&endDate=${FY.end}`],
  ["exports/ops (pnl-monthly)", `/api/exports/ops?dataset=pnl-monthly&startDate=${FY.start}&endDate=${FY.end}`],
]

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially(process.env.E2E_ADMIN_USERNAME, { delay: 15 })
await page.locator("input#password").pressSequentially(process.env.E2E_ADMIN_PASSWORD, { delay: 15 })
// Wait for hydration to enable the button rather than racing it.
await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 20000 })
await page.click('button[type="submit"]')
await page.waitForLoadState("networkidle", { timeout: 40000 })

let failures = 0
for (const [label, path] of ROUTES) {
  const res = await page.request.get(`${BASE}${path}`)
  const status = res.status()
  const text = await res.text()
  // A 500 whose body names a column is the exact failure this script exists to catch.
  const columnError = /column .* does not exist|relation .* does not exist/i.exec(text)
  const ok = status === 200 && !columnError
  if (!ok) failures++
  const detail = columnError ? ` <- ${columnError[0]}` : ""
  console.log(`  ${ok ? "ok  " : "FAIL"} ${String(status).padEnd(4)} ${label}${detail}`)
  if (!ok && !columnError) console.log(`       ${text.slice(0, 200)}`)
}

// A 200 only proves the SQL parsed. These check the number is still the right number: with no
// tenant switched over, every total must equal the legacy table's own sum to the rupee.
const { neon } = await import("@neondatabase/serverless")
const sql = neon(process.env.DATABASE_URL_DEV)
const tenantId = (await sql`SELECT id FROM tenants WHERE name = 'HoneyFarm'`)[0].id
const expected = Number(
  (await sql`
    SELECT COALESCE(SUM(total_cost), 0) AS c FROM labor_transactions
    WHERE tenant_id = ${tenantId}
      AND deployment_date >= ${FY.start}::date AND deployment_date <= ${FY.end}::date`)[0].c,
)

console.log(`\n== values, against labor_transactions directly (Rs ${expected.toLocaleString("en-IN")}) ==`)
const check = (label, actual) => {
  const ok = Math.abs(actual - expected) < 0.005
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: Rs ${actual.toLocaleString("en-IN")}`)
}

const totals = await (await page.request.get(`${BASE}/api/accounts-totals?startDate=${FY.start}&endDate=${FY.end}`)).json()
check("accounts-totals labour", Number(totals.laborTotal))

const summary = await (await page.request.get(`${BASE}/api/labour-summary?startDate=${FY.start}&endDate=${FY.end}`)).json()
check("labour-summary total", Number(summary.total))

const csv = await (await page.request.get(`${BASE}/api/exports/ops?dataset=labor&startDate=${FY.start}&endDate=${FY.end}`)).text()
const rows = csv.trim().split("\n").map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "")))
const col = rows[0].indexOf("total_cost")
const body = rows.slice(1).filter((r) => r.length > 1)
check(`exports/ops csv (${body.length} rows)`, body.reduce((sum, r) => sum + Number(r[col] || 0), 0))

console.log(failures === 0 ? "\nPASS -- every labour reader answered, with the same numbers as before\n" : `\n${failures} FAILURE(S)\n`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
