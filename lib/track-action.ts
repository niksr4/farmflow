import posthog from "posthog-js"
import * as Sentry from "@sentry/nextjs"

// Call at the top of any button's onClick — sync or async — to log intent immediately.
export function trackClick(action: string, meta?: Record<string, unknown>) {
  if (typeof window === "undefined") return
  posthog.capture("button_clicked", { action, ...meta })
}

/**
 * Call on the success path when a user creates a real operational record.
 *
 * The event name is `created_record`, not `record_created`, because the existing PostHog
 * dashboards (Activation funnel, Retention → WAU, Stuck tenants) already query `created_record`.
 * They were built against a taxonomy the app never emitted and have read flat zero ever since;
 * matching the name they expect makes them work with no dashboard changes.
 *
 * One event with a `module` property rather than labour_created / expense_created / … so a single
 * insight can break activity down by module, and adding a module needs no dashboard change.
 *
 * This existed nowhere before: edits and deletes were instrumented (labor_edit, expense_delete,
 * sales_delete…) but not creates, so the analytics could show people correcting and removing data
 * and not the primary work — no way to answer "are tenants actually using this?" from events.
 */
export function trackRecordCreated(module: string, meta?: Record<string, unknown>) {
  if (typeof window === "undefined") return
  posthog.capture("created_record", { module, ...meta })
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
