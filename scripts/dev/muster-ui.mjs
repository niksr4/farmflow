import { chromium, devices } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const OUT = "/private/tmp/claude-502/-Users-nikhilchengappa-FarmFlow-farmflow-farmflow/30f77264-d2b5-4ed3-84b3-563966358905/scratchpad"
const SERIAL = "AMDB25062800863"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const today = new Date().toISOString().slice(0, 10)

// Fresh morning: clear the day, then let the terminal put five people on the roll.
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T}`
await sql`DELETE FROM attendance_records WHERE tenant_id=${T}`
await fetch(`${BASE}/iclock/cdata?SN=${SERIAL}&table=ATTLOG`, {
  method: "POST", headers: { "Content-Type": "text/plain" },
  body: ["1", "2", "3", "4", "5"].map((id) => `${id}\t${today} 07:5${id}:00\t0\t1`).join("\n"),
})

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices["iPhone 13"] })
const page = await ctx.newPage()
const errors = []
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message))

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 20 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 20 })
await page.click('button[type="submit"]')
await page.waitForLoadState("networkidle", { timeout: 30000 })

await page.goto(`${BASE}/dashboard?tab=attendance`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(5000)
await page.screenshot({ path: `${OUT}/m-1-muster.png`, fullPage: true })

const seen = async (label, loc) => {
  const n = await loc.count()
  console.log(`  ${n > 0 ? "ok  " : "MISS"} ${label}${n > 1 ? ` (x${n})` : ""}`)
  return n
}

console.log("=== muster as it opens ===")
await seen("punch times shown on rows", page.getByText(/07:5/))
await seen("gang badge", page.getByText(/crew of 11/i))
await seen("allocate button", page.getByRole("button", { name: /allocate work/i }))
await seen("'no work set yet' hint", page.getByText(/no work set yet/i))

console.log("\n=== enter selection, pick the present crew, allocate ===")
await page.getByRole("button", { name: /allocate work/i }).click()
await page.waitForTimeout(800)
await seen("selection bar", page.getByText(/\d+ selected/))
await page.getByRole("button", { name: "Present", exact: true }).click()
await page.waitForTimeout(600)
console.log("   bar reads:", (await page.getByText(/\d+ selected/).first().innerText()).trim())
await page.screenshot({ path: `${OUT}/m-2-selecting.png`, fullPage: true })

await page.getByRole("button", { name: /^Set work$/ }).click()
await page.waitForTimeout(1200)
await seen("allocate sheet open", page.getByText(/workers selected/i))
await page.screenshot({ path: `${OUT}/m-3-sheet.png`, fullPage: true })

// work
await page.locator("#assign-code").click()
await page.waitForTimeout(700)
const codes = await page.locator('[role="option"]').allInnerTexts()
console.log("   codes offered:", codes.length)
await page.locator('[role="option"]').first().click()
await page.waitForTimeout(400)
// block
await page.locator("#assign-block").click()
await page.waitForTimeout(700)
const blocks = await page.locator('[role="option"]').allInnerTexts()
console.log("   blocks offered:", JSON.stringify(blocks.slice(0, 5)))
// "HF" is now the code, not the label -- the block reads "HF A/C" since Estate Mock was reshaped
// to mirror HoneyFarm. exact:true against the old string silently matched nothing and the click
// timed out, which reads as a broken picker rather than a stale harness.
await page.getByRole("option", { name: "HF A/C", exact: true }).click()
await page.waitForTimeout(400)
// half day
await page.getByRole("button", { name: "Half day" }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/m-4-filled.png`, fullPage: true })

await page.getByRole("button", { name: /Set work for/ }).click()
await page.waitForTimeout(3500)
await page.screenshot({ path: `${OUT}/m-5-allocated.png`, fullPage: true })

console.log("\n=== after allocating ===")
await seen("allocation chips on rows", page.locator("text=/·\\s*₹/"))
const stored = await sql`
  SELECT w.full_name, a.activity_code, COALESCE(l.name,'-') blk, a.day_fraction, a.total_cost
  FROM labour_assignments a
  JOIN attendance_workers w ON w.id=a.worker_id
  LEFT JOIN locations l ON l.id=a.location_id
  WHERE a.tenant_id=${T} AND a.work_date=${today} ORDER BY w.full_name`
console.table(stored)

console.log("\n=== page errors ===")
for (const e of errors.slice(0, 8)) console.log("  ", e)
await browser.close()
