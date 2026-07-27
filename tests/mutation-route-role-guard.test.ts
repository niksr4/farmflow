import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { canWriteModule } from "../lib/permissions"

/**
 * Guards the write-role contract at the source level.
 *
 * `requireModuleAccess(moduleId)` / `requireAnyModuleAccess([...])` only check whether a module is
 * *enabled* for the tenant/user (a feature flag) — they say nothing about the caller's role. Routes
 * that mutate tenant data are expected to separately call `canWriteModule`/`canDeleteModule` (see
 * `app/api/other-sales/route.ts`, `app/api/inventory-neon/route.ts`, `app/api/journal/route.ts` for
 * the established pattern) or an admin/owner-only gate (`requireAdminRole`/`requireOwnerRole`) when
 * the module isn't in `USER_MUTATION_MODULES` in lib/permissions.ts.
 *
 * A route that skips this lets ANY role with the module enabled — including plain "user" accounts —
 * write data the permission model says only admin/owner should touch. Found in cycle 1, files 76-90
 * (2026-07-27): `app/api/market-pricing/route.ts` POST creates buyers/price records with only a
 * `requireModuleAccess("market-pricing")` check; `app/api/compliance/route.ts` POST has the identical
 * shape for certifications/checklist items. Neither "market-pricing" nor "compliance" is in
 * USER_MUTATION_MODULES, so per the app's own model a "user"-role account should not be able to
 * write to either — but both routes let them. See .farmflow-scanner/findings_log.md for detail.
 *
 * This list must only ever shrink. If a fix adds the missing role check, delete the entry here too.
 */
const KNOWN_MISSING_WRITE_GUARD = ["app/api/compliance/route.ts", "app/api/market-pricing/route.ts"].sort()

// Modules a "user" role account may already mutate under the app's own permission model
// (lib/permissions.ts USER_MUTATION_MODULES) — a route gated only on one of these doesn't need an
// additional role check, since any role with the module enabled is *supposed* to be able to write.
const USER_MUTATION_MODULE_CANDIDATES = [
  "inventory",
  "transactions",
  "accounts",
  "processing",
  "dispatch",
  "other-sales",
  "receivables",
  "billing",
  "rainfall",
  "pepper",
  "curing",
  "quality",
  "journal",
  "sales",
  "market-pricing",
  "compliance",
  "worker-ledger",
  "attendance",
  "picking",
]

const GUARD_PATTERNS = [
  "canWriteModule(",
  "canDeleteModule(",
  "requireAdminRole(",
  "requireOwnerRole(",
  "isAdminRole(",
  "isOwnerRole(",
  '.role === "owner"',
  '.role === "admin"',
]

// Only matches real tagged-SQL mutation statements (INSERT INTO x / UPDATE x SET / DELETE FROM x),
// not the word "update" appearing in ordinary prose (e.g. a UI copy string) elsewhere in the file.
const SQL_MUTATION_RE = /(INSERT\s+INTO\s+\w+|UPDATE\s+\w+\s+SET|DELETE\s+FROM\s+\w+)/i

const collectRouteFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectRouteFiles(full))
    else if (entry === "route.ts") out.push(full)
  }
  return out
}

const findMissingWriteGuards = () => {
  const root = process.cwd()
  const apiDir = resolve(root, "app/api")
  const flagged: string[] = []

  for (const file of collectRouteFiles(apiDir)) {
    const src = readFileSync(file, "utf8")
    if (!SQL_MUTATION_RE.test(src)) continue

    const moduleMatch = src.match(/requireModuleAccess\(\s*["']([\w-]+)["']/)
    const anyModuleMatch = src.match(/requireAnyModuleAccess\(\s*\[([^\]]+)\]/)
    let moduleIds: string[] = []
    if (moduleMatch) moduleIds = [moduleMatch[1]]
    else if (anyModuleMatch) moduleIds = [...anyModuleMatch[1].matchAll(/["']([\w-]+)["']/g)].map((m) => m[1])
    // No requireModuleAccess call at all (e.g. owner-only routes gated purely on requireOwnerRole,
    // or public routes) — out of scope for this guard, they're covered by other checks/by design.
    if (!moduleIds.length) continue

    // If every gating module already lets a plain "user" role write (per canWriteModule), this route
    // doesn't need an extra guard — any role with the module enabled is meant to be able to mutate it.
    const adminOnlyModules = moduleIds.filter((m) => !canWriteModule("user", m))
    if (!adminOnlyModules.length) continue

    const hasGuard = GUARD_PATTERNS.some((p) => src.includes(p))
    if (!hasGuard) {
      flagged.push(relative(root, file).split("\\").join("/"))
    }
  }

  return flagged.sort()
}

describe("mutation route write-role guard", () => {
  it("does not add any new route that mutates admin-only-module data with no role check", () => {
    const flagged = findMissingWriteGuards()
    const added = flagged.filter((route) => !KNOWN_MISSING_WRITE_GUARD.includes(route))

    expect(
      added,
      `These routes run INSERT/UPDATE/DELETE against a module the permission model treats as ` +
        `admin/owner-only (canWriteModule("user", moduleId) is false), but never call ` +
        `canWriteModule/canDeleteModule/requireAdminRole/requireOwnerRole to enforce that — so any ` +
        `role with the module merely *enabled* can write. Add the missing check (see ` +
        `app/api/other-sales/route.ts for the established pattern).`,
    ).toEqual([])
  })

  it("keeps the known-missing-guard list accurate so fixes are noticed", () => {
    const flagged = findMissingWriteGuards()
    const fixed = KNOWN_MISSING_WRITE_GUARD.filter((route) => !flagged.includes(route))

    expect(
      fixed,
      `These routes are listed as missing a write-role guard but now look guarded (or were deleted). ` +
        `Remove them from KNOWN_MISSING_WRITE_GUARD in this file.`,
    ).toEqual([])
  })

  it("does not flag routes gated on modules user-role is already allowed to mutate", () => {
    // Sanity check for the detector itself: other-sales is gated on a USER_MUTATION_MODULES entry
    // and does have an explicit canWriteModule check anyway, so it must never appear here.
    const flagged = findMissingWriteGuards()
    expect(flagged).not.toContain("app/api/other-sales/route.ts")
    expect(flagged).not.toContain("app/api/inventory-neon/route.ts")
    expect(flagged).not.toContain("app/api/journal/route.ts")
  })

  it("does not flag routes whose only 'mutation-like' text is prose, not SQL", () => {
    // Regression guard for the detector: yield-forecast/route.ts is GET-only and contains the
    // English sentence "update it weekly" in a recommendation string, which a naive `/update/i`
    // scan mistakes for an UPDATE statement. It must not be flagged.
    const flagged = findMissingWriteGuards()
    expect(flagged).not.toContain("app/api/yield-forecast/route.ts")
  })
})
