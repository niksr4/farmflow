import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guards against a recurring internal-error-disclosure bug: an API route's catch block returning
 * the raw `error.message` (or `error?.message`, `(error as Error).message`, `String(error)`,
 * `error?.toString()`) to the client instead of routing it through
 * `sanitizeRouteError`/`buildErrorResponse`/`buildAdminErrorResponse`/`getErrorMessage`
 * (lib/server/route-utils.ts, lib/server/sanitize-route-error.ts) -- whether that raw value lands
 * directly in the JSON response's "error" field, or in a sibling field (e.g. "message") returned
 * alongside a safe "error" field, which discloses the same internals just under a different key.
 *
 * Those helpers strip DB/internal details (column names, constraint names, connection strings,
 * SQL syntax errors, etc. -- see sanitize-route-error.ts's INTERNAL_PATTERNS) before a message ever
 * reaches the browser. A route that skips them can leak raw Postgres errors on any unexpected
 * 500 -- e.g. a transient connection failure, a future schema-drift-triggered query error, or a
 * DB-side constraint violation whose text includes column/table names.
 *
 * First found 2026-08-06 in the privacy routes (fixed, tracked as NIK-28) and again 2026-08-13
 * across five more routes (account/password, account/preferences, accounts-summary,
 * accounts-totals, add-activity -- consolidated as NIK-32, still open/unfixed as of this scan). This
 * guard was added 2026-08-16 after finding two more fresh instances during a routine batch review
 * (app/api/admin/weekly-summary/route.ts, app/api/ai-analysis/route.ts). A repo-wide scan of every app/api route.ts file for the raw-access
 * pattern surfaced many more candidates, three of which (app/api/account/email/route.ts,
 * app/api/auth/confirm-email-change/route.ts, app/api/attendance/report/route.ts) turned out on
 * manual verification to be false positives -- their only raw `.message` access is on a locally-
 * thrown Error subclass with a permanently safe, curated message (see VERIFIED_FALSE_POSITIVES
 * below) -- while reviewing files 26-40 in the same run turned up six more genuine leaks routed
 * through two non-sanitizing "normalizer" helpers (see NORMALIZER_PASSTHROUGH_RE below). The list
 * below reflects everything confirmed as a real leak by full manual read, not just regex matches -- seeded into KNOWN_RAW_ERROR_LEAKS
 * below so this list documents current tech debt and only shrinks as routes get fixed, the same
 * convention as KNOWN_MISSING_WRITE_GUARD in mutation-route-role-guard.test.ts.
 *
 * This list must only ever shrink. If a fix routes a flagged file's error responses through one of
 * the safe helpers, delete the entry here too (the second test below also catches a stale entry
 * automatically).
 */
const KNOWN_RAW_ERROR_LEAKS = [
  "app/api/account/password/route.ts",
  "app/api/account/preferences/route.ts",
  "app/api/accounts-summary/route.ts",
  "app/api/accounts-totals/route.ts",
  "app/api/add-activity/route.ts",
  "app/api/admin/weekly-summary/route.ts",
  "app/api/ai-analysis/route.ts",
  "app/api/ai-proactive-insights/route.ts",
  "app/api/attendance/devices/[id]/route.ts",
  "app/api/attendance/devices/route.ts",
  "app/api/attendance/route.ts",
  "app/api/attendance/unmapped-codes/route.ts",
  "app/api/attendance/workers/[id]/route.ts",
  "app/api/attendance/workers/route.ts",
  "app/api/benchmarks/route.ts",
  "app/api/billing/invoices/[id]/route.ts",
  "app/api/billing/invoices/route.ts",
  "app/api/billing/webhooks/razorpay/route.ts",
  "app/api/compliance/route.ts",
  "app/api/cron/daily-digest/route.ts",
  "app/api/cron/data-integrity/route.ts",
  "app/api/cron/log-anomalies/route.ts",
  "app/api/cron/orchestrator/route.ts",
  "app/api/cron/retention/route.ts",
  "app/api/cron/tenant-dormancy-probe/route.ts",
  "app/api/cron/tenant-engagement/route.ts",
  "app/api/cron/tenant-smoke/route.ts",
  "app/api/cron/weekly-digest/route.ts",
  "app/api/documents/[id]/file/route.ts",
  "app/api/documents/route.ts",
  "app/api/exception-alerts/route.ts",
  "app/api/exports/ops/route.ts",
  "app/api/finance-balance-sheet/route.ts",
  "app/api/get-activity/route.ts",
  "app/api/inventory-summary/route.ts",
  "app/api/market-pricing/route.ts",
  "app/api/plant-health/route.ts",
  "app/api/processing-records/check-anomaly/route.ts",
  "app/api/recent-activity/route.ts",
  "app/api/register-interest/route.ts",
  "app/api/season-summary/route.ts",
  "app/api/tenant-modules/route.ts",
  "app/api/transactions-neon/batch/route.ts",
  "app/api/weather/rainfall-context/route.ts",
  "app/api/yield-forecast/route.ts",
].sort()

// Any of these anywhere in the file means its error responses go through the safe path -- even if
// only some branches use it, treat the file as handled rather than false-positiving on files that
// are migrating incrementally. (None of the seeded entries above hit this today; this is here so
// the detector doesn't re-flag a file the moment a fix adds the helper to just one branch.)
const SAFE_HELPERS = [
  "sanitizeRouteError(",
  "buildErrorResponse(",
  "buildAdminErrorResponse(",
  "getErrorMessage(",
]

const RAW_MESSAGE_ACCESS_RE =
  /error\s*\?\.\s*message|error\s*\.\s*message|\(error as Error\)\.message|String\(error\)|error\s*\?\.\s*toString\(\)/

// lib/biometric-attendance.ts's normalizeBiometricSchemaError(error) and lib/attendance.ts's
// sibling normalizeAttendanceSchemaError(error) both look like sanitizers but aren't: each only
// special-cases the one known "schema not migrated" error, and passes any other error through
// unchanged (`if (error instanceof Error) return error`) -- so `.message` off either result is
// exactly as raw as `error.message` for every non-schema failure. Treat any file that calls either
// as suspect the same way a raw access would be; all six current call sites (found 2026-08-16)
// leak through this: app/api/attendance/devices/[id]/route.ts, app/api/attendance/devices/route.ts,
// app/api/attendance/unmapped-codes/route.ts (normalizeBiometricSchemaError), and
// app/api/attendance/route.ts, app/api/attendance/workers/[id]/route.ts,
// app/api/attendance/workers/route.ts (normalizeAttendanceSchemaError).
const NORMALIZER_PASSTHROUGH_RE = /normalizeBiometricSchemaError\(|normalizeAttendanceSchemaError\(/

const collectRouteFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectRouteFiles(full))
    else if (entry === "route.ts") out.push(full)
  }
  return out
}

// Routes whose only raw `.message` access is on a ModuleAccessError instance -- a locally-thrown
// error class (lib/module-access.ts) that is always constructed with its fixed default message
// ("Module access disabled") and never wraps a raw DB/upstream error. `.message` off it is exactly
// as safe as a hardcoded string, so it isn't a leak even though it matches the raw-access regex.
// Verified by full manual read 2026-08-16: app/api/attendance/report/route.ts's only match
// ((error as Error).message on line 149) sits inside `if (isModuleAccessError(error))`, and its
// generic catch-all fallback already returns a hardcoded safe string.
// Same reasoning as ModuleAccessError above, for two more locally-thrown Error subclasses:
// EmailChangeError (lib/server/email-change.ts) is always constructed with one of a handful of
// curated static message constants (never a raw DB/upstream error -- verified by reading every
// `throw new EmailChangeError(...)` call site), and RateLimitUnavailableError (lib/rate-limit.ts)
// has a single hardcoded message baked into its constructor. `app/api/account/email/route.ts` and
// `app/api/auth/confirm-email-change/route.ts` only ever access `.message` on instances of these
// two classes (plus a hardcoded-safe final fallback string), so despite matching the raw-access
// regex, neither actually leaks anything DB-internal.
const VERIFIED_FALSE_POSITIVES = new Set([
  "app/api/attendance/report/route.ts",
  "app/api/account/email/route.ts",
  "app/api/auth/confirm-email-change/route.ts",
])

const findRawErrorMessageLeaks = (): string[] => {
  const root = process.cwd()
  const apiDir = resolve(root, "app/api")
  const flagged: string[] = []

  for (const file of collectRouteFiles(apiDir)) {
    const relativePath = relative(root, file).split("\\").join("/")
    if (VERIFIED_FALSE_POSITIVES.has(relativePath)) continue
    const src = readFileSync(file, "utf8")
    if (SAFE_HELPERS.some((helper) => src.includes(helper))) continue

    if (NORMALIZER_PASSTHROUGH_RE.test(src)) {
      flagged.push(relative(root, file).split("\\").join("/"))
      continue
    }
    if (!RAW_MESSAGE_ACCESS_RE.test(src)) continue

    // Look at a window of text following each JSON "error:" field. A leak either shows up directly
    // in that expression (`error: error.message`, `error: error instanceof Error ? error.message : ...`)
    // or in a sibling field returned in the same response object (e.g. `message: error?.message`
    // alongside a safe `error: "..."` string) -- either way the client receives the raw text.
    let looksLikeLeak = false
    const errorFieldRe = /error:\s*/g
    let match: RegExpExecArray | null
    while ((match = errorFieldRe.exec(src))) {
      const windowText = src.slice(match.index, match.index + 220)
      if (RAW_MESSAGE_ACCESS_RE.test(windowText)) {
        looksLikeLeak = true
        break
      }
      // Field value may be a plain identifier assigned from a raw access earlier
      // (`const message = error?.message || "..."; ... error: message`).
      const idMatch = windowText.match(/^error:\s*([a-zA-Z0-9_]+)/)
      if (idMatch) {
        const varName = idMatch[1]
        const assignRe = new RegExp(
          `(?:const|let)\\s+${varName}\\s*=\\s*[^;\\n]*(?:error\\s*\\?\\.\\s*message|error\\s*\\.\\s*message|String\\(error|error\\s*\\?\\.\\s*toString\\(\\))`,
        )
        if (assignRe.test(src)) {
          looksLikeLeak = true
          break
        }
      }
    }

    if (looksLikeLeak) {
      flagged.push(relative(root, file).split("\\").join("/"))
    }
  }

  return flagged.sort()
}

describe("raw error.message leak guard", () => {
  it("does not add any new route that returns a raw error.message to the client", () => {
    const flagged = findRawErrorMessageLeaks()
    const added = flagged.filter((route) => !KNOWN_RAW_ERROR_LEAKS.includes(route))

    expect(
      added,
      `These routes return a raw error.message (or equivalent) directly to the client on failure, ` +
        `bypassing sanitizeRouteError/buildErrorResponse/buildAdminErrorResponse -- which can leak ` +
        `DB internals (column/constraint names, connection details, SQL syntax errors) on an ` +
        `unexpected 500. Route the error field through one of those helpers instead (see ` +
        `app/api/admin/data-integrity-exceptions/route.ts or app/api/admin/users/route.ts for the ` +
        `established pattern).`,
    ).toEqual([])
  })

  it("keeps the known-leak list accurate so fixes are noticed", () => {
    const flagged = findRawErrorMessageLeaks()
    const fixed = KNOWN_RAW_ERROR_LEAKS.filter((route) => !flagged.includes(route))

    expect(
      fixed,
      `These routes are listed as leaking a raw error.message but no longer look like they do ` +
        `(or were deleted/renamed). Remove them from KNOWN_RAW_ERROR_LEAKS in this file.`,
    ).toEqual([])
  })

  it("does not flag routes that already sanitize their error responses", () => {
    // Sanity check for the detector itself.
    const flagged = findRawErrorMessageLeaks()
    expect(flagged).not.toContain("app/api/admin/data-integrity-exceptions/route.ts")
    expect(flagged).not.toContain("app/api/admin/users/route.ts")
    expect(flagged).not.toContain("app/api/admin/tenants/route.ts")
  })
})
