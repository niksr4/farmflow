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

import { smokeRoutes, isSmokeFailure, collectSources } from "./release-utils.mjs"

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

/**
 * Resolve one import specifier to a file on disk, or null.
 *
 * ⚠ BOTH SHAPES, AND index FILES. The first version read only `@/...` and ignored `./` and `../`
 * entirely -- three route files here use them -- so a paid key reached through a relative import
 * was classed as free and called on every single run.
 */
const resolveSpecifier = (spec, fromFile) => {
  const base = spec.startsWith("@/")
    ? path.resolve(spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(fromFile), spec)
      : null
  if (!base) return null // a bare package name; node_modules is out of scope
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const resolveImports = (src, fromFile) =>
  [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)]
    .map((m) => resolveSpecifier(m[1], fromFile))
    .filter(Boolean)

const readSourceOrNull = (f) => {
  try {
    return readFileSync(f, "utf8")
  } catch {
    return null
  }
}

const entries = walk(API).map((f) => {
  const source = readFileSync(f, "utf8")
  // Transitive, with a visited set -- a key read two modules down still excludes the route.
  const depSources = collectSources(f, readSourceOrNull, resolveImports).slice(1)
  return { routePath: "/" + path.relative(path.resolve("app"), path.dirname(f)), source, depSources }
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

  /**
   * ⚠ A CREDENTIAL THAT DOES NOT WORK IS NOT A BROKEN DEPLOYMENT, and conflating the two is
   * dangerous in exactly one direction: go-live.mjs rolls back when this script fails, so a
   * rotated or stale SMOKE_PASSWORD would revert a perfectly good release and report it as a
   * failed smoke. Found the moment the credential was first wired in -- the password committed in
   * api-smoke.mjs is the DEV estate_mock's and prod's is different, so the very first
   * authenticated run failed against a live site that was entirely healthy.
   *
   * The distinction is observable rather than assumed: ask the auth endpoint. A 5xx means the auth
   * system itself is down, which IS breakage and must fail. Anything else means auth answered and
   * declined us, which is a configuration problem on this machine.
   */
  if (!authed) {
    let authStatus = -1
    try {
      authStatus = (await page.request.get(`${BASE}/api/auth/providers`, { timeout: 30000 })).status()
    } catch {}
    if (authStatus >= 500 || authStatus < 0) {
      failures.push({ route: "/api/auth/providers", status: authStatus, body: "auth system is not answering" })
      console.log(`  ⚠ could not sign in AND /api/auth/providers returned ${authStatus} -- auth is broken`)
    } else {
      console.log(`  ⚠ could not sign in as ${username}, but auth answered ${authStatus} -- the credential is wrong,`)
      console.log(`    not the site. Falling back to the unauthenticated pass. Fix SMOKE_PASSWORD in .env.local;`)
      console.log(`    note the one in scripts/dev/api-smoke.mjs is the DEV account's, not production's.`)
    }
  }
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
