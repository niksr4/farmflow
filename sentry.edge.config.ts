// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://9ff9672ddc6ade0965e0a02e09f6cf3c@o4511210874339328.ingest.de.sentry.io/4511212832817232",

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  tracesSampleRate: 0.05,
})
