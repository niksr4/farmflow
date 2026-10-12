#!/usr/bin/env node
/**
 * Call every safe read endpoint on a running FarmFlow and report anything that is not alive.
 *
 *   pnpm smoke                          # https://www.thefarmflow.in
 *   pnpm smoke -- --url http://localhost:3000
 *   pnpm smoke -- --all                 # include the externally-billed routes too
 *
 * WHY AGAINST THE LIVE DOMAIN. The usual answer -- smoke the deployment before pointing the domain
 * at it -- does not work on this plan. The project sets ssoProtection.deploymentType =
 * "all_except_custom_domains", so every URL except thefarmflow.in sits behind Vercel's login wall;
 * a --skip-domain build returns 302 to vercel.com/sso-api for every path. There is no automation
 * bypass configured, and relaxing ssoProtection would expose every preview build instead.
 *
 * So the deployment becomes testable at the exact moment it becomes live. The way to make that
 * survivable is not to test earlier -- it is to make the live window short: go-live.mjs runs this
 * immediately after aliasing and rolls back automatically if it fails.
 *
 * ⚠ THIS WRITES TO PRODUCTION, in one specific way: it logs in, which mints a session and records
 * an auth_login_success security event. It does so as `estate_mock`, the mock tenant that exists
 * for exactly this. Every request after that is a GET. If you would rather it wrote nothing at
 * all, run without credentials -- it falls back to an unauthenticated pass, which still catches a
 * route that 500s before reaching its auth check, just not one that 500s after.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import path from "node:path"
import { chromium } from "@playwright/test"

import { smokeRoutes, isSmokeFailure } from "./release-utils.mjs"

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback
}
const flag = (name) => process.argv.includes(`--${name}`)

const BASE = (arg("url") || "https://www.thefarmflow.in").replace(/\/$/, "")
const INCLUDE_BILLED = flag("all")

const envValue = (name) => {
  if (process.env[name]) return process.env[name]
  for (const f of [".env.local", ".env"]) {
    try {
      const m = readFileSync(f, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))
      if (m) return m[1].trim().replace(/^["']|["']$/g, "")
    } catch {}
  }
  return null
}

// ── Which routes ──────────────────────────────────────────────────────────────────────────────
const API = path.resolve("app/api")
const walk = (d) =>
  readdirSync(d).flatMap((e) => {
    const f = path.join(d, e)
    return statSync(f).isDirectory() ? walk(f) : e === "route.ts" ? [f] : []
  })

// The paid-API key a route depends on is usually read one module down (lib/server/coffee-prices.ts
// rather than the route), so the exclusion needs the imports' source too, not just the route's.
const localImportSources = (src) =>
  [...src.matchAll(/from "@\/([^"]+)"/g)]
    .map((m) => m[1])
    .flatMap((p) => [".ts", ".tsx"].map((e) => path.resolve(p + e)))
    .filter(existsSync)
    .map((f) => readFileSync(f, "utf8"))

const entries = walk(API).map((f) => {
  const source = readFileSync(f, "utf8")
  return { routePath: "/" + path.relative(path.resolve("app"), path.dirname(f)), source, depSources: localImportSources(source) }
})

const routes = smokeRoutes(entries, { includeBilled: INCLUDE_BILLED })
const skipped = smokeRoutes(entries, { includeBilled: true }).filter((r) => !routes.includes(r))

// ── Run ───────────────────────────────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)

const username = envValue("SMOKE_USERNAME") || "estate_mock"
const password = envValue("SMOKE_PASSWORD")

console.log(`\nSMOKE  ${BASE}`)
console.log(`  ${routes.length} route(s) to call${skipped.length ? `, ${skipped.length} skipped as externally billed` : ""}`)

const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
const failures = []

// ── Public surfaces, always ───────────────────────────────────────────────────────────────────
// These are what a stranger sees. A 500 here is the loudest possible breakage and needs no login.
for (const p of ["/", "/login", "/signup"]) {
  try {
    const res = await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 30000 })
    const status = res?.status() ?? -1
    if (status !== 200) failures.push({ route: p, status, body: "public page did not return 200" })
  } catch (e) {
    failures.push({ route: p, status: -1, body: String(e.message).slice(0, 120) })
  }
}
console.log(`  public pages: ${failures.length === 0 ? "ok" : `${failures.length} failing`}`)

// ── Authenticated sweep ───────────────────────────────────────────────────────────────────────
let authed = false
if (password) {
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
    await page.locator("input#username").pressSequentially(username, { delay: 15 })
    await page.locator("input#password").pressSequentially(password, { delay: 15 })
    await page.click('button[type="submit"]')
    for (let i = 0; i < 40 && !/\/dashboard/.test(page.url()); i++) await page.waitForTimeout(500)
    authed = /\/dashboard/.test(page.url())
  } catch {}
  if (!authed) failures.push({ route: "/login", status: -1, body: `could not sign in as ${username}` })
}

if (!password) {
  console.log(`  no SMOKE_PASSWORD set -- unauthenticated pass only (a route that 500s AFTER its auth check will not be seen)`)
}

for (const r of routes) {
  const url = `${BASE}${r}?startDate=${monthAgo}&endDate=${today}&start=${monthAgo}&end=${today}&date=${today}&limit=5`
  let status = 0
  let body = ""
  try {
    const res = await page.request.get(url, { timeout: 30000 })
    status = res.status()
    if (status >= 400) body = (await res.text()).slice(0, 160)
  } catch (e) {
    status = -1
    body = String(e.message).slice(0, 120)
  }
  if (isSmokeFailure(status)) {
    failures.push({ route: r, status, body })
    console.log(`  ${String(status).padStart(4)}  ${r}\n        ${body}`)
  }
}

await browser.close()

console.log(
  failures.length === 0
    ? `\n✓ SMOKE PASSES -- ${routes.length} endpoints and 3 public pages answered${authed ? ` (signed in as ${username})` : ""}\n`
    : `\n⚠ ${failures.length} FAILING:\n${failures.map((f) => `    ${f.status}  ${f.route}`).join("\n")}\n`,
)
process.exit(failures.length === 0 ? 0 : 1)
