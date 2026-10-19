import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { isFunnelFault } from "../lib/server/funnel-telemetry"

/**
 * A PUBLIC ROUTE THAT CATCHES ITS OWN ERRORS AND TELLS NOBODY IS A BLIND SPOT, NOT A FEATURE.
 *
 * ⚠ All five funnel routes -- signup, verify-email, resend-verification, reset-password and
 * contact -- caught their errors, sanitized a sentence for the browser, and called no logger of
 * any kind. Zero logServerError, zero logAppErrorEvent, zero Sentry. `app_error_events` holds 25
 * rows on production and not one came from a funnel route.
 *
 * It already cost something: two stranded signup rows carry
 * `provisioning_error = 'column "password_reset_required" of relation "users" does not exist'`,
 * dated 21 and 22 March -- a schema break that failed provisioning for every signup for at least
 * a day, recorded in a column nothing reads and reported to nobody.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

describe("isFunnelFault", () => {
  /**
   * Imported, not re-implemented. A test carrying its own copy of this rule would stay green
   * while the real one changed -- which is a trap this codebase has already fallen into once.
   */
  it("reports a server error", () => {
    expect(isFunnelFault({ status: 500, rawMessage: "x", sanitizedMessage: "x" })).toBe(true)
    expect(isFunnelFault({ status: 502, rawMessage: "x", sanitizedMessage: "x" })).toBe(true)
  })

  it("reports anything whose message had to be scrubbed, because that was an internal error", () => {
    expect(
      isFunnelFault({
        status: 400,
        rawMessage: 'relation "users" does not exist',
        sanitizedMessage: "Failed to create signup request",
      }),
    ).toBe(true)
  })

  it("stays quiet for a person getting something wrong", () => {
    // These are the overwhelming majority of what these routes catch, and reporting them would
    // bury the one event that matters under a few hundred ordinary ones a month.
    for (const [status, message] of [
      [409, "An account already exists for this email"],
      [400, "Verification link has expired. Request a new one."],
      [404, "No pending signup found for this email"],
    ] as const) {
      expect(
        isFunnelFault({ status, rawMessage: message, sanitizedMessage: message }),
        `${status} "${message}" is correct behaviour and must not be reported as a fault`,
      ).toBe(false)
    }
  })
})

describe("every public funnel route reports its failures", () => {
  /**
   * DERIVED, not a list of the four routes fixed. A public route is one that sanitizes an error
   * for an untrusted caller and never asks for a session -- so a sixth one added tomorrow is
   * covered tomorrow.
   */
  const routes = execFileSync("git", ["ls-files", "app"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith("route.ts"))

  const publicFunnelRoutes = routes.filter((f) => {
    const src = stripComments(readFileSync(f, "utf8"))
    const sanitizes = /sanitizeRouteError\s*\(/.test(src)
    /**
     * ⚠ KEYED ON THE `require*` NAMING CONVENTION, NOT ON A LIST OF HELPERS.
     *
     * The first version of this predicate named four helpers by hand and produced three false
     * positives -- exports/ops, intelligence-brief and search -- all of which are properly gated,
     * by `requireAnyModuleAccess`, which was simply not on my list. A hand-kept list of auth
     * helpers inside a guard against hand-kept lists is its own punchline.
     *
     * Every gate in this codebase is named require<Something>, so match that shape and a sixth
     * helper added later is handled without editing this file.
     */
    const authenticated = /\brequire[A-Z]\w*\s*\(/.test(src)
    return sanitizes && !authenticated
  })

  it("finds the public routes, so this cannot pass by scanning nothing", () => {
    expect(
      publicFunnelRoutes.length,
      "no public error-sanitizing routes found -- the scan is broken, not the code",
    ).toBeGreaterThanOrEqual(4)
    // And specifically these, so a predicate that drifts into excluding everything is caught
    // rather than quietly reporting a clean sweep of zero routes.
    for (const known of [
      "app/api/auth/signup/route.ts",
      "app/api/auth/verify-email/route.ts",
      "app/api/auth/resend-verification/route.ts",
      "app/api/auth/reset-password/route.ts",
    ]) {
      expect(
        publicFunnelRoutes,
        `${known} is the signup funnel and must be in the scanned set`,
      ).toContain(known)
    }
  })

  it.each(publicFunnelRoutes)("%s reports to something", (file) => {
    const src = stripComments(readFileSync(file, "utf8"))
    const reports =
      /reportFunnelFailure\s*\(/.test(src) ||
      /logAppErrorEvent\s*\(/.test(src) ||
      /logServerError\s*\(/.test(src)
    expect(
      reports,
      `${file} is public, catches its own errors, sanitizes them for the caller, and tells no ` +
        "logger anything. A failure here is invisible: the browser gets a tidy sentence and no " +
        "record exists anywhere.",
    ).toBe(true)
  })
})

describe("the report does not leak an unverified stranger's personal data", () => {
  /**
   * These routes are the one place in the app where the request body is a stranger's name, email
   * and estate name. An error log is not the place for any of it, and lib/redaction.ts only
   * scrubs Sentry, not app_error_events.
   */
  it("passes only the error, endpoint and status", () => {
    const src = stripComments(readFileSync("lib/server/funnel-telemetry.ts", "utf8"))
    for (const field of ["email", "name", "estateName", "password", "token"]) {
      expect(
        new RegExp(`\\b${field}\\b`).test(src),
        `funnel-telemetry references ${field} -- an error event must not carry it`,
      ).toBe(false)
    }
  })
})
