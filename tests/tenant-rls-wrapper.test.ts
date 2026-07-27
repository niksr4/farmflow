import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guards the tenant-isolation contract at the source level.
 *
 * `sql` in lib/server/db.ts resolves to APP_DATABASE_URL — the least-privilege `app_runtime`
 * role, which is NOT BYPASSRLS. The RLS policy created by scripts/98-enable-rls-all-tenant-tables.sql
 * gates every table carrying a tenant_id on two Postgres GUCs, `app.tenant_id` and `app.role`, and
 * runTenantQuery/runTenantQueries/runTenantTransaction are the only things that set them (transaction-
 * locally, via set_config(..., true)).
 *
 * A route that queries a tenant table without going through one of those wrappers therefore reads
 * back ZERO rows — silently. It does not error, and an explicit `WHERE tenant_id = $1` filter does
 * not help: the filter makes the query correct, not visible. The failure looks exactly like "this
 * tenant has no data yet", so it hides behind empty-state UI and never reaches monitoring.
 */

const TENANT_TABLES = [
  "processing_records",
  "dispatch_records",
  "sales_records",
  "other_sales_records",
  "labor_transactions",
  "expense_transactions",
  "account_activities",
  "current_inventory",
  "attendance_records",
  "attendance_workers",
  "pepper_records",
  "rubber_records",
  "curing_records",
  "billing_invoices",
  "receivables",
  "compliance_records",
  "locations",
]

const TENANT_TABLE_RE = new RegExp(`\\b(?:FROM|INTO|UPDATE|JOIN)\\s+(?:${TENANT_TABLES.join("|")})\\b`, "i")

/**
 * Routes known to query tenant tables with no tenant wrapper anywhere in the file.
 *
 * Every entry is a confirmed or strongly-suspected silent-empty-read bug, not an approved
 * exemption. Three were verified directly against the dev database (the query returns 0 rows as
 * `app_runtime` and the true count when wrapped); the rest match the same shape and are pending
 * confirmation. See .farmflow-scanner/findings_log.md, cycle 1 files 61-75.
 *
 * This list must only ever shrink. If a fix removes a route from it, delete the entry here too.
 */
const KNOWN_UNWRAPPED = [
  "app/api/activity-streak/route.ts", // pending confirmation — streak likely always 0
  "app/api/benchmarks/route.ts", // CONFIRMED — peer benchmarks always "not enough estates"
  "app/api/dashboard/season-pace/route.ts", // CONFIRMED — pace chart always empty
  "app/api/dashboard/season-projection/route.ts", // CONFIRMED — projection always hasData:false
  "app/api/reconciliation/route.ts", // pending confirmation
].sort()

/**
 * Routes that legitimately query a tenant table with no tenant wrapper, because there is no
 * session/tenant context to set in the first place — not bugs, and not pending confirmation.
 *
 * `app/api/lots/[lotId]/route.ts` is a public, unauthenticated QR-code lot-traceability lookup
 * (see its own header comment: "Public endpoint — no auth required"). It looks up a lot by an
 * opaque `lot_id` across ALL tenants deliberately, so there is no single tenant to scope a
 * `runTenantQuery` call to. Confirmed this run (2026-07-27, cycle 1, files 76-90) by reading the
 * route: it never calls requireSessionUser/requireModuleAccess and joins to `tenants` only to read
 * a display name, not to authorize. This closes out the "pending confirmation" note left on it in
 * the 61-75 batch — it does not belong on KNOWN_UNWRAPPED, which is reserved for actual bugs.
 */
const PUBLIC_NO_TENANT_CONTEXT_ROUTES = ["app/api/lots/[lotId]/route.ts"]

const collectRouteFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectRouteFiles(full))
    else if (entry === "route.ts") out.push(full)
  }
  return out
}

const findUnwrappedRoutes = () => {
  const root = process.cwd()
  const apiDir = resolve(root, "app/api")
  const unwrapped: string[] = []

  for (const file of collectRouteFiles(apiDir)) {
    const src = readFileSync(file, "utf8")
    if (!TENANT_TABLE_RE.test(src)) continue
    // adminSql is the deliberate owner-connection escape hatch and bypasses RLS by design.
    if (src.includes("adminSql")) continue
    if (src.includes("runTenantQuer")) continue
    unwrapped.push(relative(root, file).split("\\").join("/"))
  }

  return unwrapped.sort()
}

describe("tenant RLS wrapper guard", () => {
  it("does not add any new route that queries tenant tables without a tenant wrapper", () => {
    const unwrapped = findUnwrappedRoutes()
    const added = unwrapped.filter(
      (route) => !KNOWN_UNWRAPPED.includes(route) && !PUBLIC_NO_TENANT_CONTEXT_ROUTES.includes(route),
    )

    expect(
      added,
      `These routes query a tenant_id table but never call runTenantQuery/runTenantQueries/` +
        `runTenantTransaction, so under RLS they read back zero rows silently. Wrap the queries ` +
        `(use normalizeTenantContext(undefined, "owner") for deliberately cross-tenant reads), or ` +
        `use adminSql if bypassing RLS is genuinely intended.`,
    ).toEqual([])
  })

  it("keeps the known-unwrapped list accurate so fixes are noticed", () => {
    const unwrapped = findUnwrappedRoutes()
    const fixed = KNOWN_UNWRAPPED.filter((route) => !unwrapped.includes(route))

    expect(
      fixed,
      `These routes are listed as known-unwrapped but now look wrapped (or were deleted). ` +
        `Remove them from KNOWN_UNWRAPPED in this file.`,
    ).toEqual([])
  })

  it("recognises the wrapper helpers the codebase actually uses", () => {
    // Regression guard for the detection itself: these three routes were false positives in an
    // earlier grep-based sweep. They wrap correctly, just not at the call site — via a queryList
    // array, a generic helper, and a tryQuery wrapper respectively — so the guard must not flag them.
    const unwrapped = findUnwrappedRoutes()

    expect(unwrapped).not.toContain("app/api/dispatch/route.ts")
    expect(unwrapped).not.toContain("app/api/finance-balance-sheet/route.ts")
    expect(unwrapped).not.toContain("app/api/dashboard/estate-pulse/route.ts")
    expect(unwrapped).not.toContain("app/api/exception-alerts/route.ts")
  })

  it("keeps app/api/lots/[lotId]/route.ts on the public-no-tenant-context list, not the bug list", () => {
    // If this route ever starts requiring a session (requireSessionUser/requireModuleAccess) it
    // should move to using runTenantQuery like everything else, and drop off both lists.
    const unwrapped = findUnwrappedRoutes()
    expect(unwrapped).toContain("app/api/lots/[lotId]/route.ts")
    expect(KNOWN_UNWRAPPED).not.toContain("app/api/lots/[lotId]/route.ts")
    expect(PUBLIC_NO_TENANT_CONTEXT_ROUTES).toContain("app/api/lots/[lotId]/route.ts")
  })
})
