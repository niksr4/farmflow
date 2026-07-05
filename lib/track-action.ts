import posthog from "posthog-js"
import * as Sentry from "@sentry/nextjs"

// Call at the top of any button's onClick — sync or async — to log intent immediately.
export function trackClick(action: string, meta?: Record<string, unknown>) {
  if (typeof window === "undefined") return
  posthog.capture("button_clicked", { action, ...meta })
}

// Call when an API action returns a non-ok result (no exception thrown, just a failure response).
export function reportActionFailure(action: string, error: string, meta?: Record<string, unknown>) {
  if (typeof window === "undefined") return
  posthog.capture("action_failed", { action, error, ...meta })
  Sentry.captureMessage(`[${action}] ${error}`, { level: "warning", tags: { action }, extra: meta })
}

// Call when an action throws an unexpected exception.
export function reportActionError(action: string, err: unknown, meta?: Record<string, unknown>) {
  if (typeof window === "undefined") return
  const message = err instanceof Error ? err.message : String(err)
  posthog.capture("action_failed", { action, error: message, ...meta })
  Sentry.captureException(err instanceof Error ? err : new Error(message), {
    tags: { action },
    extra: meta,
  })
}
