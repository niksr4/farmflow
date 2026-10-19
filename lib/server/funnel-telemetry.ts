import "server-only"

import { logAppErrorEvent } from "@/lib/server/error-events"
import { logServerError } from "@/lib/server/safe-logging"

/**
 * THE SIGNUP FUNNEL REPORTED ITS OWN FAILURES TO NOTHING.
 *
 * ⚠ All five public funnel routes -- signup, verify-email, resend-verification, reset-password
 * and contact -- caught their errors, turned them into a sanitized sentence for the browser, and
 * called no logger of any kind. Zero logServerError, zero logAppErrorEvent, zero Sentry.
 * `app_error_events` holds 25 rows on production and not one of them came from a funnel route.
 *
 * IT HAS ALREADY COST SOMETHING. Two stranded signup rows carry
 *
 *   provisioning_error = 'column "password_reset_required" of relation "users" does not exist'
 *
 * dated 21 and 22 March -- a schema break that failed provisioning for every signup for at least
 * a day, recorded in a column nothing in the codebase ever reads, and reported to nobody. The
 * sibling route on the same public surface, /api/register-interest, has done this correctly the
 * whole time; this is that pattern, extracted so all five share one definition.
 *
 * WHY NOT JUST REPORT EVERY CAUGHT ERROR: most of what these routes catch is a person, not a
 * fault. "An account already exists for this email" is a 409 and correct behaviour; a failed zod
 * parse is a 400 and correct behaviour. Reporting those would put a few hundred ordinary events a
 * month on top of the one that matters, which is the same as not reporting it. So the rule below
 * keys on the two things that actually mean something broke.
 */

type FunnelFailureInput = {
  /** Route path, e.g. "/api/auth/signup". Also used as the error-event source. */
  endpoint: string
  /** The thrown value. */
  error: unknown
  /** HTTP status the route decided to return. */
  status: number
  /**
   * The message BEFORE sanitizing, and the message after. When they differ, sanitizeRouteError
   * judged the original unsafe to show a stranger -- which is as close as this codebase gets to
   * "this was an internal fault, not a user mistake".
   */
  rawMessage: string
  sanitizedMessage: string
}

/**
 * True when the caught error represents a fault rather than a person getting something wrong.
 *
 * Exported for the guard: the decision is the whole point of this module, and a test that
 * re-implements it would stay green while this changed. Pure, so it can be asserted directly.
 */
export const isFunnelFault = (input: {
  status: number
  rawMessage: string
  sanitizedMessage: string
}): boolean => {
  // 5xx is a fault by definition: nothing the caller typed should produce one.
  if (input.status >= 500) return true
  // A message that had to be scrubbed was a raw database or internal error. Every curated,
  // user-facing sentence in these routes passes through sanitizeRouteError unchanged.
  return input.rawMessage !== input.sanitizedMessage
}

/**
 * Report a funnel failure to both the server log and `app_error_events`.
 *
 * Never throws and never awaits anything the response depends on: a reporting failure must not
 * turn a handled 400 into a 500. Call it, do not await it, and return the response.
 */
export function reportFunnelFailure(input: FunnelFailureInput): void {
  if (!isFunnelFault(input)) return

  // Deliberately the error and the endpoint only. No email address, no name, no estate name --
  // these routes are the one place in the app where the payload is an unverified stranger's
  // personal data, and an error log is not the place for it. lib/redaction.ts scrubs Sentry, not
  // this table.
  logServerError(`${input.endpoint} failed (${input.status})`, input.error)

  void logAppErrorEvent({
    source: input.endpoint.replace(/^\/api\//, "").replace(/\//g, "-"),
    endpoint: input.endpoint,
    errorCode: input.status >= 500 ? "funnel_server_error" : "funnel_internal_error",
    severity: "error",
    message: input.rawMessage.slice(0, 2000),
  }).catch((reportingError) => {
    // The one thing worse than an unreported funnel failure is an unreported failure to report it.
    logServerError("Failed to record a funnel error event", reportingError)
  })
}
