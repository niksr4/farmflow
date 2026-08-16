/**
 * Punch to P&L: does a day allocated on the muster roll reach everything downstream?
 *
 * Run: node --env-file=.env.local scripts/dev/muster-end-to-end.mjs
 *
 * This is the question the whole redesign turns on. Allocating work on the roll is only an
 * improvement if Accounts, the season P&L, the cost-per-kg figure and the digests all report it
 * without anyone re-typing anything. And they only do once the tenant has a cutover date -- until
 * then labour_cost reads the legacy table alone and the muster's work is invisible, which is
 * exactly the silent under-report the view exists to prevent.
 */

import { chromium } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const SERIAL = "AMDB25062800863"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const today = new Date().toISOString().slice(0, 10)
const FY = { start: "2026-04-01", end: "2027-03-31" }

let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

// Clean slate, then a terminal puts five people on the roll.
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T}`
await sql`DELETE FROM attendance_records WHERE tenant_id=${T}`
await sql`DELETE FROM tenant_labour_entry_mode WHERE tenant_id=${T}`
await fetch(`${BASE}/iclock/cdata?SN=${SERIAL}&table=ATTLOG`, {
  method: "POST", headers: { "Content-Type": "text/plain" },
  body: ["1", "2", "3", "4", "5"].map((id) => `${id}\t${today} 07:5${id}:00\t0\t1`).join("\n"),
})

const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 20 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 20 })
await page.click('button[type="submit"]')
await page.waitForLoadState("networkidle", { timeout: 30000 })

const punched = await sql`SELECT worker_id FROM attendance_records WHERE tenant_id=${T} AND attendance_date=${today}::date`
console.log(`\n== ${punched.length} punched in at the terminal ==`)
check(punched.length === 5, "five punches landed without anyone opening the app")

const blocks = await sql`SELECT id, name FROM locations WHERE tenant_id=${T} ORDER BY name LIMIT 2`
const codes = await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 2`

console.log("\n== allocate the morning: three on one block, two on another ==")
for (const [i, row] of punched.entries()) {
  const res = await page.request.post(`${BASE}/api/attendance/assignments`, {
    data: {
      date: today,
      workerIds: [row.worker_id],
      activityCode: codes[i < 3 ? 0 : 1].code,
      locationId: blocks[i < 3 ? 0 : 1].id,
      dayFraction: 1,
    },
  })
  if (res.status() !== 200) { failures++; console.log("  FAIL allocate:", res.status(), (await res.text()).slice(0, 120)) }
}
const allocated = await sql`SELECT COALESCE(SUM(total_cost),0) c, COUNT(*)::int n FROM labour_assignments WHERE tenant_id=${T}`
const expected = Number(allocated[0].c)
console.log(`  ${allocated[0].n} assignments, Rs ${expected.toLocaleString("en-IN")}`)
check(allocated[0].n === 5, "five allocations written")

const ask = async (path) => (await page.request.get(`${BASE}${path}`)).json()

console.log("\n== BEFORE a cutover date: downstream still reads the legacy table ==")
const before = await ask(`/api/labour-summary?startDate=${FY.start}&endDate=${FY.end}`)
check(
  Number(before.total ?? 0) !== expected,
  `muster work is deliberately NOT counted yet (reports Rs ${Number(before.total ?? 0).toLocaleString("en-IN")}, not Rs ${expected.toLocaleString("en-IN")})`,
)

console.log(`\n== set the cutover to ${today} and ask again ==`)
await sql`INSERT INTO tenant_labour_entry_mode (tenant_id, assignments_from) VALUES (${T}, ${today}::date)
          ON CONFLICT (tenant_id) DO UPDATE SET assignments_from=EXCLUDED.assignments_from`

const legacyBefore = Number(
  (await sql`SELECT COALESCE(SUM(total_cost),0) c FROM labor_transactions
             WHERE tenant_id=${T} AND deployment_date >= ${FY.start}::date AND deployment_date < ${today}::date`)[0].c,
)
const want = legacyBefore + expected
console.log(`  expect Rs ${legacyBefore.toLocaleString("en-IN")} legacy + Rs ${expected.toLocaleString("en-IN")} muster = Rs ${want.toLocaleString("en-IN")}`)

const summary = await ask(`/api/labour-summary?startDate=${FY.start}&endDate=${FY.end}`)
check(Math.abs(Number(summary.total) - want) < 0.005, `labour-summary: Rs ${Number(summary.total).toLocaleString("en-IN")}`)
check(Number(summary.source?.fromMuster) === 5, `labour-summary knows 5 rows came from the muster`)

const totals = await ask(`/api/accounts-totals?startDate=${FY.start}&endDate=${FY.end}`)
check(Math.abs(Number(totals.laborTotal) - want) < 0.005, `accounts-totals: Rs ${Number(totals.laborTotal).toLocaleString("en-IN")}`)

const pl = await ask(`/api/season-pl?start=${FY.start}&end=${FY.end}`)
const plLabour = Number(pl?.costs?.laborTotalInr ?? NaN)
check(Number.isFinite(plLabour) && Math.abs(plLabour - want) < 0.005, `season-pl labour: Rs ${plLabour.toLocaleString("en-IN")}`)

// By block is the number Manoj actually asked for: which block the money went to.
const byBlock = (summary.byBlock || []).filter((b) => b.cost > 0)
console.log(`  by block -> ${byBlock.map((b) => `${b.label} Rs ${b.cost.toLocaleString("en-IN")}`).join(", ")}`)
check(byBlock.length >= 2, "the day splits across the two blocks it was worked on")

// The digests read the same view, so they must agree without a second code path.
const { buildDigestEstateBreakdown } = await import("../../lib/server/agents/digest-estate-breakdown.ts").catch(() => ({}))
console.log("\n== digests read the same view ==")
const digestLabour = Number(
  (await sql`SELECT COALESCE(SUM(total_cost),0) c FROM labour_cost
             WHERE tenant_id=${T} AND work_date BETWEEN ${FY.start}::date AND ${FY.end}::date`)[0].c,
)
check(Math.abs(digestLabour - want) < 0.005, `the view the digests query totals Rs ${digestLabour.toLocaleString("en-IN")}`)

console.log("\n== cleaning up ==")
await sql`DELETE FROM tenant_labour_entry_mode WHERE tenant_id=${T}`
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T}`
const restored = await ask(`/api/accounts-totals?startDate=${FY.start}&endDate=${FY.end}`)
check(Math.abs(Number(restored.laborTotal) - legacyBefore) < 0.005, "removing the cutover restores the legacy total")

console.log(failures === 0 ? "\nPASS -- the muster reaches Accounts, P&L and the digests\n" : `\n${failures} FAILURE(S)\n`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
