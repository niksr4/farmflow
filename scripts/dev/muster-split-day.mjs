/**
 * One worker, two jobs, two blocks, half a day each -- the case the whole redesign exists for.
 *
 * Run: node --env-file=.env.local scripts/dev/muster-split-day.mjs
 *
 * Also asserts the work and block listboxes actually land on screen. That is not paranoia: a
 * tenant's 80 activity codes made a 980px listbox that Radix flipped to y=-279 on a phone, i.e.
 * entirely above the top of the display. The dropdown was unusable and nothing threw.
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
  body: ["1", "2", "3", "4", "5"].map((id) => `${id}\t${today} 07:5${id}:00\t0\t1`).join("\n"),
})

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices["iPhone 13"] })
const page = await ctx.newPage()

const errors = []
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message))
page.on("console", (m) => {
  // Vercel Analytics' debug script is dev-only and blocked by CSP here; in production it is
  // served same-origin from /_vercel/insights. Not a finding, and not worth drowning real ones.
  if (m.type() === "error" && !m.text().includes("va.vercel-scripts.com")) errors.push(m.text())
})
const writes = []
const failed = []
page.on("response", async (res) => {
  if (res.url().includes("/api/attendance/assignments")) {
    let body = null
    try { body = await res.json() } catch {}
    writes.push({ method: res.request().method(), status: res.status(), error: body?.error })
  }
  if (res.status() >= 400) failed.push(`${res.status()} ${res.request().method()} ${res.url().replace(BASE, "")}`)
})

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 20 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 20 })
await page.click('button[type="submit"]')
await page.waitForLoadState("networkidle", { timeout: 30000 })
await page.goto(`${BASE}/dashboard?tab=attendance`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(5000)

const vh = page.viewportSize().height
let failures = 0

/** Open a combobox, prove the listbox is on screen, choose the nth option, return its label. */
const pick = async (label, comboLabel, optionIndex) => {
  // By accessible name, not position -- the page has its own filter comboboxes and an index-based
  // locator silently drove one of those instead.
  const trigger = page.getByRole("combobox", { name: comboLabel, exact: true }).first()
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  await page.waitForTimeout(600)
  const box = await page.locator('[role="listbox"]').first().boundingBox()
  const count = await page.locator('[role="option"]').count()
  const fits = box && box.y >= -1 && box.y + box.height <= vh + 1
  if (!fits) failures++
  console.log(
    `  ${fits ? "ok  " : "FAIL"} ${label} listbox on screen` +
    ` (${count} options, y=${Math.round(box?.y ?? 0)}..${Math.round((box?.y ?? 0) + (box?.height ?? 0))}, viewport 0..${vh})`,
  )
  const opt = page.locator('[role="option"]').nth(optionIndex)
  const text = (await opt.innerText()).trim().split("\n")[0]
  await opt.click()
  await page.waitForTimeout(400)
  return text
}

const allocate = async (n, activityIdx, blockIdx) => {
  await page.getByRole("button", { name: /set work/i }).first().click()
  await page.waitForTimeout(500)
  const work = await pick(`job ${n}`, "Work", activityIdx)
  const block = await pick(`block ${n}`, "Block", blockIdx)
  await page.getByRole("button", { name: "Half", exact: true }).first().click()
  await page.waitForTimeout(200)
  await page.getByRole("button", { name: "Add", exact: true }).first().click()
  await page.waitForTimeout(2500)
  console.log(`       -> ${work} @ ${block}, half day`)
}

console.log("\n== first worker, two half-day jobs in different blocks ==")
await allocate(1, 0, 1)
await allocate(2, 1, 2)
await page.screenshot({ path: `${OUT}/split-day.png`, fullPage: true })

console.log("\n== what the server stored ==")
const rows = await sql`
  SELECT w.full_name AS name, la.activity_code, l.name AS block, la.day_fraction, la.total_cost
  FROM labour_assignments la
  JOIN attendance_workers w ON w.id = la.worker_id
  LEFT JOIN locations l ON l.id = la.location_id
  WHERE la.tenant_id = ${T} AND la.work_date = ${today}::date
  ORDER BY w.full_name, la.created_at`
for (const r of rows) {
  console.log(`  ${r.name} | ${r.activity_code} | ${r.block ?? "no block"} | ${r.day_fraction} day | Rs ${r.total_cost}`)
}

const byWorker = rows.reduce((m, r) => m.set(r.name, (m.get(r.name) ?? 0) + Number(r.day_fraction)), new Map())
console.log("\n== assertions ==")
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }
check(rows.length === 2, `two assignment rows written (got ${rows.length})`)
check(byWorker.size === 1, `both rows on one worker (got ${byWorker.size})`)
check([...byWorker.values()].every((v) => Math.abs(v - 1) < 1e-9), `the day sums to exactly 1 (got ${[...byWorker.values()].join(", ")})`)
check(new Set(rows.map((r) => r.activity_code)).size === 2, "two different activity codes")
check(new Set(rows.map((r) => r.block)).size === 2, "two different blocks")
check(rows.every((r) => Number(r.total_cost) > 0), "each half day costs something")
check(writes.every((w) => w.status === 200), `writes all 200 (${writes.map((w) => w.status + (w.error ? ` ${w.error}` : "")).join(", ")})`)
check(errors.length === 0, `no console errors (${errors.slice(0, 2).join(" | ") || "none"})`)
if (failed.length) console.log("  note: non-2xx responses seen ->", [...new Set(failed)].join(", "))

console.log(failures === 0 ? "\nPASS\n" : `\n${failures} FAILURE(S)\n`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
