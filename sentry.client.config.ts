// This file configures the initialization of Sentry on the browser.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://9ff9672ddc6ade0965e0a02e09f6cf3c@o4511210874339328.ingest.de.sentry.io/4511212832817232",

  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  // Low sample rate — captures enough to spot patterns without inflating quota.
  tracesSampleRate: 0.05,

  // Replay 1% of sessions, 100% of sessions with an error.
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media by default to avoid capturing PII.
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  ignoreErrors: [
    "Unauthorized",
    "Module access disabled",
    // Browser extension noise
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
  ],
})
