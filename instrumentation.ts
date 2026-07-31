import * as Sentry from "@sentry/nextjs"

import { assertCoreRuntimeConfig } from "@/lib/runtime-config"

export async function register() {
  assertCoreRuntimeConfig()

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

/**
 * Next.js calls this for every uncaught server-side error — route handlers, server actions,
 * and React Server Component renders.
 *
 * Without it the Sentry SDK never sees those errors. Until now the only server errors reaching
 * Sentry were the ones explicitly passed to `logServerError`; anything that threw out of a
 * route handler was logged by Next and dropped. That is a large part of why the dashboard
 * looked empty.
 */
export const onRequestError = Sentry.captureRequestError
