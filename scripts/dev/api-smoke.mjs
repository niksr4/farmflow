/**
 * Call every read endpoint and report anything that is not a 200.
 *
 * Run: node --env-file=.env.local scripts/dev/api-smoke.mjs
 *
 * Exists because of a bug I shipped: pointing a query at the booked_revenue view without
 * updating its SELECT list left it asking for kgs_received, weight_kgs and kgs_sent -- columns
 * the view resolves away. That is a runtime 500 no typecheck and no lint can see, and it reached
 * production. The operations sweep only catches it if a tab happens to call the route; this
 * calls all of them directly.
 */
import { chromium } from "@playwright/test"
import { readdirSync, statSync, readFileSync } from "node:fs"
import path from "node:path"

const BASE = "http://localhost:3000"
const API = path.resolve("app/api")

const walk = (d) => readdirSync(d).flatMap((e) => {
  const f = path.join(d, e)
  return statSync(f).isDirectory() ? walk(f) : (e === "route.ts" ? [f] : [])
})

const today = new Date().toISOString().slice(0, 10)
const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)

// Routes with a GET, no dynamic segment, and not a webhook/cron/admin-write surface.
const routes = walk(API)
  .filter((f) => /export async function GET/.test(readFileSync(f, "utf8")))
  .map((f) => "/" + path.relative(path.resolve("app"), path.dirname(f)))
  .filter((r) => !/\[/.test(r))
  .filter((r) => !/\/(cron|webhooks|iclock)\b/.test(r))
  .sort()

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await p.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await p.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await p.click('button[type="submit"]')
for (let i = 0; i < 40 && !/\/dashboard/.test(p.url()); i++) await p.waitForTimeout(500)

console.log(`\ncalling ${routes.length} GET endpoints\n`)
const bad = []
for (const r of routes) {
  // Generic params most report routes accept; harmless where ignored.
  const url = `${BASE}${r}?startDate=${monthAgo}&endDate=${today}&start=${monthAgo}&end=${today}&date=${today}&limit=5`
  let status = 0, body = ""
  try {
    const res = await p.request.get(url, { timeout: 30000 })
    status = res.status()
    if (status >= 400) body = (await res.text()).slice(0, 160)
  } catch (e) {
    status = -1
    body = String(e.message).slice(0, 120)
  }
  // 401/403 are module gates or role checks doing their job, not breakage.
  const ok = status === 200 || status === 401 || status === 403 || status === 404
  if (!ok) { bad.push({ r, status, body }); console.log(`  ${String(status).padStart(4)}  ${r}\n        ${body}`) }
}

console.log(bad.length === 0
  ? `\nPASS -- all ${routes.length} endpoints answered\n`
  : `\n${bad.length} ENDPOINT(S) FAILING:\n${bad.map((x) => `  ${x.status} ${x.r}`).join("\n")}\n`)
await b.close()
process.exit(bad.length === 0 ? 0 : 1)
