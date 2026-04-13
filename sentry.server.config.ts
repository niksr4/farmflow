// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://9ff9672ddc6ade0965e0a02e09f6cf3c@o4511210874339328.ingest.de.sentry.io/4511212832817232",

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  // Low sample rate in production — we have app_error_events for structured error tracking.
  // Traces are for diagnosing slow requests, not routine errors.
  tracesSampleRate: 0.1,

  // Suppress noise from expected control-flow errors.
  ignoreErrors: [
    "Unauthorized",
    "Module access disabled",
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],
})
