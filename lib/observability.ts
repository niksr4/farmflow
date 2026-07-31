/**
 * Issue-grouping helpers for Sentry.
 *
 * Sentry groups by fingerprint. Left to the default, everything routed through a single
 * logging helper collapses into one useless mega-issue (same synthetic stack every time).
 * Fingerprinting on the raw log message is the opposite failure: this codebase writes lines
 * like `Weekly digest generation failed for tenant 8789431e-…`, so the raw message would mint
 * a separate issue per tenant, per record id, per date — thousands of near-duplicates that
 * bury the one real regression and blow through the quota.
 *
 * The fix is to normalise the variable parts out of the message before using it as a grouping
 * key, so all tenants hitting the same failure land in one issue with a count next to it.
 */

// `\b` is the wrong boundary here: an underscore counts as a word character, so `\b` never
// fires in the prefixed-id style these services use everywhere (`dpl_9f3a…`, `cus_…`, `req_…`)
// and those ids would sail through unnormalised — the exact issue-per-id explosion this
// module exists to stop. A leading capture group is used instead of a lookbehind, which
// Safari only supports from 16.4 and this module is bundled into the browser.
const BOUNDARY = "(^|[^0-9a-z])"
const NOT_FOLLOWED = "(?![0-9a-z])"

const UUID_PATTERN = new RegExp(
  `${BOUNDARY}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}${NOT_FOLLOWED}`,
  "gi",
)
const ISO_DATE_PATTERN =
  /(^|[^0-9a-z])\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?(?![0-9a-z])/gi
const LONG_HEX_PATTERN = new RegExp(`${BOUNDARY}[0-9a-f]{16,}${NOT_FOLLOWED}`, "gi")
const NUMBER_PATTERN = new RegExp(`${BOUNDARY}\\d{2,}${NOT_FOLLOWED}`, "gi")

/**
 * Collapse identifiers and other per-occurrence noise so the same failure produces the same
 * grouping key regardless of which tenant, record, or day it happened on.
 *
 * Order matters: UUIDs and ISO dates are matched before the generic number rule, or their
 * digit runs would be rewritten first and the structure lost.
 */
export function normalizeForFingerprint(message: string): string {
  return String(message || "")
    .replace(UUID_PATTERN, "$1<uuid>")
    .replace(ISO_DATE_PATTERN, "$1<date>")
    .replace(LONG_HEX_PATTERN, "$1<hex>")
    .replace(NUMBER_PATTERN, "$1<n>")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Grouping key for an error that carries a real stack. `{{ default }}` keeps Sentry's own
 * stack-based grouping and adds the normalised message, so two unrelated failures sharing a
 * helper frame stay separate without splitting one failure across every tenant.
 */
export const fingerprintForException = (message: string): string[] => [
  "{{ default }}",
  normalizeForFingerprint(message),
]

/**
 * Grouping key for a log line with no underlying Error. There is no meaningful stack to group
 * on — every one of these would otherwise share the logging helper's frames — so the
 * normalised message is the whole key.
 */
export const fingerprintForMessage = (message: string): string[] => [
  "log-server-error",
  normalizeForFingerprint(message),
]

/** Release identifier, used to tie issues to a deploy and spot regressions after a ship. */
export const resolveRelease = (): string | undefined =>
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  undefined

type ScrubbableEvent = {
  message?: unknown
  exception?: { values?: Array<{ value?: unknown }> }
}

/**
 * Applies the shared redaction rules to the free-text fields of a Sentry event.
 *
 * Server *logs* have always been redacted, but the payloads sent to Sentry were not — so
 * emails and bearer tokens embedded in error strings were stored verbatim by a third party.
 * Used by every runtime's `beforeSend` so the browser scrubs exactly like the server.
 */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T, redact: (value: string) => string): T {
  try {
    if (typeof event.message === "string") {
      event.message = redact(event.message)
    }
    const values = event.exception?.values
    if (Array.isArray(values)) {
      for (const entry of values) {
        if (entry && typeof entry.value === "string") {
          entry.value = redact(entry.value)
        }
      }
    }
  } catch {
    // Never drop an event because scrubbing threw — a redaction bug must not blind the error
    // reporter. Worst case the text goes through unredacted, exactly as it did before.
  }
  return event
}
