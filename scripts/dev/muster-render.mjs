/**
 * Renders the muster roll on a phone and a laptop, with a real morning in it.
 *
 * Run: node --env-file=.env.local scripts/dev/muster-render.mjs
 */

import { chromium, devices } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const OUT = "/private/tmp/claude-502/-Users-nikhilchengappa-FarmFlow-farmflow-farmflow/30f77264-d2b5-4ed3-84b3-563966358905/scratchpad"
const SERIAL = "AMDB25062800863"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const today = new Date().toISOString().slice(0, 10)

await sql`DELETE FROM labour_assignments WHERE tenant_id=${T}`
await sql`DELETE FROM attendance_records WHERE tenant_id=${T}`
await fetch(`${BASE}/iclock/cdata?SN=${SERIAL}&table=ATTLOG`, {
  method: "POST", headers: { "Content-Type": "text/plain" },
  body: ["1", "2", "3", "4", "5", "6"].map((id) => `${id}\t${today} 07:5${id}:00\t0\t1`).join("\n"),
})

const browser = await chromium.launch()

const shoot = async (label, contextOptions) => {
  const page = await (await browser.newContext(contextOptions)).newPage()
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
  await page.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
  await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 20000 })
  await page.click('button[type="submit"]')
  await page.waitForLoadState("networkidle", { timeout: 40000 })

  if (label === "phone") {
    // Give the roll a real shape: a split day, a gang, and someone left unallocated.
    const punched = await sql`SELECT worker_id FROM attendance_records WHERE tenant_id=${T} AND attendance_date=${today}::date ORDER BY worker_id`
    const blocks = await sql`SELECT id FROM locations WHERE tenant_id=${T} ORDER BY name LIMIT 3`
    const codes = await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 3`
    const plan = [
      [0, 0, 0, 1], [0, 1, 1, 0.5],
      [1, 1, 1, 1], [2, 2, 2, 1], [3, 0, 2, 1],
    ]
    for (const [w, c, b, day] of plan) {
      if (!punched[w]) continue
      await page.request.post(`${BASE}/api/attendance/assignments`, {
        data: { date: today, workerIds: [punched[w].worker_id], activityCode: codes[c].code, locationId: blocks[b].id, dayFraction: day },
      })
    }
  }

  await page.goto(`${BASE}/dashboard?tab=attendance`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(4500)
  await page.screenshot({ path: `${OUT}/muster-${label}.png`, fullPage: true })
  console.log(`  wrote muster-${label}.png`)
  await page.close()
}

await shoot("phone", { ...devices["iPhone 13"] })
await shoot("desktop", { viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 })

await browser.close()
