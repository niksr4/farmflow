/**
 * Walk every Operations tab and report what an estate would actually find there.
 *
 * Run: node --env-file=.env.local scripts/dev/operations-sweep.mjs [--mobile]
 *
 * The accounting audit asked whether the numbers are right. This asks a different and equally
 * load-bearing question: does the tab render at all, does it say something useful when empty,
 * and does it fail loudly rather than showing a confident zero. A tab that throws is obvious;
 * a tab that quietly renders "Rs 0" because its fetch 500'd is the one that gets believed.
 *
 * Read-only: it navigates and reads. Nothing is created, edited or deleted.
 */
import { chromium, devices } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const MOBILE = process.argv.includes("--mobile")
const OUT = "/private/tmp/claude-502/-Users-nikhilchengappa-FarmFlow-farmflow-farmflow/30f77264-d2b5-4ed3-84b3-563966358905/scratchpad"
const sql = neon(process.env.DATABASE_URL_DEV)

const TABS = [
  "attendance", "accounts", "picking", "processing", "dispatch", "sales",
  "inventory", "transactions", "rainfall", "balance-sheet", "season-pl",
  "season", "ai-analysis", "journal", "activity-log", "resources", "news",
]

/** Phrases that mean the page gave up, as opposed to legitimately having no data. */
const BROKEN = [
  /failed to load/i, /something went wrong/i, /an error occurred/i,
  /application error/i, /unhandled/i, /cannot read propert/i,
  /undefined is not/i, /NaN/, /Invalid Date/i, /\[object Object\]/,
]
/** Legitimate emptiness. Distinguished from breakage on purpose -- these are fine. */
const EMPTY = [/no .* (yet|found|recorded|match)/i, /nothing to show/i, /get started/i, /add your first/i]

const browser = await chromium.launch()
const ctx = await browser.newContext(MOBILE ? { ...devices["iPhone 13"] } : { viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const consoleErrors = []
const failedRequests = []
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push({ tab: current, text: m.text().slice(0, 160) }) })
page.on("requestfailed", (r) => failedRequests.push({ tab: current, url: r.url().replace(BASE, ""), err: r.failure()?.errorText }))
page.on("response", (r) => {
  if (r.status() >= 500 && r.url().includes("/api/")) serverErrors.push({ tab: current, url: r.url().replace(BASE, ""), status: r.status() })
})
const serverErrors = []
let current = "login"

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await page.click('button[type="submit"]')
// Neither networkidle nor waitForURL works here: analytics and Sentry beacons keep a request in
// flight so "load" never fires, and the sweep timed out before it looked at a single tab. The
// navigation itself succeeds -- so poll the URL rather than wait on an event that will not come.
for (let i = 0; i < 40; i++) {
  if (/\/dashboard/.test(page.url())) break
  await page.waitForTimeout(1000)
}
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(1000)
  const t = await page.locator("body").innerText().catch(() => "")
  if (t.length > 200 && !/^\s*Loading/i.test(t)) break
}

console.log(`\n=== Operations sweep (${MOBILE ? "MOBILE iPhone 13" : "DESKTOP 1440"}) ===\n`)
console.log(`${"tab".padEnd(16)} ${"state".padEnd(10)} notes`)
console.log("-".repeat(78))

const findings = []

for (const tab of TABS) {
  current = tab
  const before = { c: consoleErrors.length, s: serverErrors.length }
  let state = "ok", note = ""

  try {
    await page.goto(`${BASE}/dashboard?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 30000 })

    // Wait for CONTENT, not for a clock. A fixed 3.5s pause reported seven tabs as blank that
    // were merely slow -- rainfall needs over eight seconds to paint -- and a sweep that invents
    // failures is worse than no sweep, because the real ones stop being believed.
    let body = ""
    for (let waited = 0; waited < 25000; waited += 1000) {
      await page.waitForTimeout(1000)
      body = await page.locator("body").innerText().catch(() => "")
      const settled = body.length > 200 && !/^\s*Loading/i.test(body) && !/Loading Estate/i.test(body)
      if (settled) break
    }

    if (!body || body.trim().length < 40) {
      state = "BLANK"; note = "rendered almost nothing"
    } else {
      const broke = BROKEN.find((re) => re.test(body))
      const empty = EMPTY.some((re) => re.test(body))
      if (broke) { state = "BROKEN"; note = `matched ${broke}` }
      else if (empty) { state = "empty"; note = "empty state shown (fine)" }
    }

    const newServer = serverErrors.length - before.s
    const newConsole = consoleErrors.length - before.c
    if (newServer > 0) { state = "BROKEN"; note = `${newServer} API 5xx` }
    else if (newConsole > 0 && state === "ok") { note = `${newConsole} console error(s)` }
  } catch (e) {
    state = "THREW"; note = String(e.message).slice(0, 60)
  }

  const flag = state === "ok" || state === "empty" ? "  " : "**"
  console.log(`${flag}${tab.padEnd(14)} ${state.padEnd(10)} ${note}`)
  if (state !== "ok" && state !== "empty") findings.push({ tab, state, note })
}

console.log("\n--- API 5xx ---")
console.log(serverErrors.length ? serverErrors.map((e) => `  ${e.tab.padEnd(14)} ${e.status} ${e.url}`).join("\n") : "  none")

console.log("\n--- failed requests ---")
console.log(failedRequests.length ? failedRequests.map((e) => `  ${e.tab.padEnd(14)} ${e.err} ${e.url}`).join("\n") : "  none")

console.log("\n--- console errors (deduped) ---")
const seen = new Set()
const uniq = consoleErrors.filter((e) => !seen.has(e.text) && seen.add(e.text))
console.log(uniq.length ? uniq.slice(0, 12).map((e) => `  ${e.tab.padEnd(14)} ${e.text}`).join("\n") : "  none")

console.log(`\n${findings.length === 0 ? "PASS -- every tab rendered" : `${findings.length} TAB(S) NEED ATTENTION`}\n`)
await page.screenshot({ path: `${OUT}/sweep-${MOBILE ? "mobile" : "desktop"}.png`, fullPage: false }).catch(() => {})
await browser.close()
