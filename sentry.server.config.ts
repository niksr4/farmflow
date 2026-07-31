// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs"

import { redactText } from "@/lib/redaction"
import { resolveRelease, scrubSentryEvent } from "@/lib/observability"

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? "https://9ff9672ddc6ade0965e0a02e09f6cf3c@o4511210874339328.ingest.de.sentry.io/4511212832817232",

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  // Ties every issue to a deploy, which is what makes "first seen in this release" and
  // regression detection work. Without it Sentry cannot tell a new bug from a long-standing one.
  release: resolveRelease(),

  // Low sample rate in production — we have app_error_events for structured error tracking.
  // Traces are for diagnosing slow requests, not routine errors. This does NOT sample errors:
  // every captured exception is sent regardless.
  tracesSampleRate: 0.1,

  // Suppress noise from expected control-flow errors.
  ignoreErrors: [
    "Unauthorized",
    "Module access disabled",
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],

  beforeSend: (event) => scrubSentryEvent(event, redactText),
})
