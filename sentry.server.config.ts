import * as Sentry from "@sentry/nextjs"

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    // Don't capture noise from known safe errors
    ignoreErrors: [
      "Unauthorized",
      "Module access disabled",
      "NEXT_NOT_FOUND",
      "NEXT_REDIRECT",
    ],
  })
}
