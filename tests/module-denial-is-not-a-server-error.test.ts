import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A MODULE DENIAL IS POLICY (403), NEVER A SERVER FAULT (500).
 *
 * `requireModuleAccess` THROWS a `ModuleAccessError` when the tenant's plan does not include the
 * module. A handler that wraps it in `try { } catch { return 500 }` therefore reports a working
 * access check as a crash.
 *
 * ⚠ THIS WAS LIVE. Found on 2026-10-13 by the first authenticated run of scripts/dev/smoke-live.mjs
 * against production: GET /api/billing/invoices answered **HTTP 500** with
 * `{"error":"Module access disabled"}` for every tenant, because `billing` is enterprise-only and
 * all six tenants are on `core`. It had been invisible because the smoke had no credential, so
 * every authenticated route answered 401 and never reached its module check.
 *
 * Why it matters beyond the status code:
 *   - it mints Sentry issues for normal policy, burying real faults
 *   - a client cannot distinguish "your plan lacks this" from "the server broke"
 *   - it made the release gate refuse EVERY deploy, since the smoke treats >=500 as breakage
 *
 * ⚠ AND THE FIRST VERSION OF THIS SCAN WAS VACUOUS. It asked whether `status: 403` appeared
 * anywhere in the FILE, reported 0 offenders while production was returning 500, and would have
 * shipped as a passing guard. billing/invoices has a 403 in its POST handler -- a role check that
 * says nothing about GET. Per-FILE is the wrong granularity for a per-HANDLER property.
 */

const API = path.resolve("app/api")

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : entry === "route.ts" ? [full] : []
  })

/** Split a route file into one block per HTTP verb, so a sibling handler's 403 cannot vouch for this one. */
const handlersOf = (source: string) => {
  const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g
  const marks = [...source.matchAll(re)].map((m) => ({ verb: m[1], at: m.index as number }))
  return marks.map((m, i) => ({
    verb: m.verb,
    body: source.slice(m.at, i + 1 < marks.length ? marks[i + 1].at : source.length),
  }))
}

/**
 * Everything from the handler's first `catch` to its end.
 *
 * ⚠ NOT A CHARACTER WINDOW. This was `/catch[\s\S]{0,400}?status:\s*500/` and it was VACUOUS: the
 * explanatory comment inside the fixed catch block is ~340 characters, which pushed `status: 500`
 * past the 400-char limit, so the handler was never even considered and a tamper that removed the
 * entire fix still passed. A guard whose reach depends on how much prose sits inside the block it
 * is reading is a guard that silently switches off when someone documents their code.
 *
 * Scoping to the catch region is also stricter in the right way: a 403 in the `try` (a role check)
 * no longer excuses a catch that maps every thrown error to 500, which is precisely the defect.
 */
const catchRegion = (body: string) => {
  const i = body.indexOf("catch")
  return i === -1 ? "" : body.slice(i)
}

type Handler = { route: string; verb: string; body: string }

const GATED: Handler[] = walk(API).flatMap((file) => {
  const source = readFileSync(file, "utf8")
  const route = "/" + path.relative(path.resolve("app"), path.dirname(file))
  return handlersOf(source)
    .filter((h) => /requireModuleAccess\s*\(|requireAnyModuleAccess\s*\(/.test(h.body))
    .map((h) => ({ route, verb: h.verb, body: h.body }))
})

describe("a module denial is answered with 403, not 500", () => {
  it("finds the gated handlers at all, so this cannot pass by scanning nothing", () => {
    // A derived set that silently empties is a test that always passes.
    expect(GATED.length).toBeGreaterThan(50)
    const names = GATED.map((h) => `${h.route} [${h.verb}]`)
    expect(names).toContain("/api/billing/invoices [GET]")
    expect(names).toContain("/api/feedback [POST]")
  })

  it("has every gated handler that catches into a 500 check for the denial first", () => {
    const offenders = GATED.filter((h) => {
      const region = catchRegion(h.body)
      if (!/status:\s*500/.test(region)) return false
      // Keyed on the CALL, not the mention -- an import line or a comment naming
      // isModuleAccessError must not satisfy this.
      return !(/isModuleAccessError\s*\(/.test(region) || /status:\s*403/.test(region))
    }).map((h) => `${h.route} [${h.verb}]`)

    expect(
      offenders,
      "these call requireModuleAccess and map every thrown error to 500, so a tenant whose plan lacks the module gets a server error instead of a 403",
    ).toEqual([])
  })
})
