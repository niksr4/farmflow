// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs"

import { redactText } from "@/lib/redaction"
import { resolveRelease, scrubSentryEvent } from "@/lib/observability"

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? "https://9ff9672ddc6ade0965e0a02e09f6cf3c@o4511210874339328.ingest.de.sentry.io/4511212832817232",

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  release: resolveRelease(),

  tracesSampleRate: 0.05,

  // Middleware runs on every request — the same control-flow noise the Node runtime filters
  // would otherwise dominate the issue stream from here.
  ignoreErrors: ["Unauthorized", "Module access disabled", "NEXT_NOT_FOUND", "NEXT_REDIRECT"],

  beforeSend: (event) => scrubSentryEvent(event, redactText),
})
