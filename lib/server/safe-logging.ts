import "server-only"

import * as Sentry from "@sentry/nextjs"

import { redactText, redactValue, serializeError } from "@/lib/redaction"
import { fingerprintForException, fingerprintForMessage } from "@/lib/observability"

// Redaction rules live in lib/redaction.ts so the Sentry config files can scrub with the same
// rules without importing this module (which imports Sentry, and would cycle). Re-exported
// here under their historic names so existing callers keep working.
export const redactForLogs = redactValue
export const serializeErrorForLogs = serializeError
export { redactText }

export const logServerWarning = (message: string, details?: unknown) => {
  if (details === undefined) {
    console.warn(message)
    return
  }
  console.warn(message, redactValue(details))
}

export const logServerError = (message: string, details?: unknown) => {
  if (details === undefined) {
    console.error(message)
  } else {
    console.error(message, redactValue(details))
  }

  // Forward to Sentry so server-side errors appear in the issues dashboard.
  // Wrapped in try/catch so a Sentry failure never breaks the caller.
  try {
    const safeMessage = redactText(message)
    const extra = details === undefined ? undefined : { details: redactValue(details) }

    if (details instanceof Error) {
      // Capture the real Error so Sentry gets the stack from where it was actually thrown.
      // Synthesising a new Error here (the previous behaviour) stamped every server error
      // with this file's stack, so unrelated failures grouped together and the trace pointed
      // at the logger instead of the bug.
      Sentry.captureException(details, {
        extra: { logMessage: safeMessage, ...(extra ?? {}) },
        fingerprint: fingerprintForException(safeMessage),
      })
      return
    }

    // No Error to attach — there is no useful stack, so group on the normalised message.
    Sentry.captureMessage(safeMessage, {
      level: "error",
      extra,
      fingerprint: fingerprintForMessage(safeMessage),
    })
  } catch {
    // non-fatal
  }
}
