import * as Sentry from "@sentry/nextjs"
import posthog from "posthog-js"

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    ignoreErrors: ["Unauthorized", "Module access disabled"],
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
  })
}

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST
const posthogDebug = process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "true"
const posthogAllowLocal = process.env.NEXT_PUBLIC_POSTHOG_ALLOW_LOCAL === "true"

function isLocalHost(hostname: string) {
  const normalized = String(hostname || "").toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized.endsWith(".local")
}

if (posthogKey && posthogHost) {
  const isLocal = typeof window !== "undefined" && isLocalHost(window.location.hostname)
  if (!isLocal || posthogAllowLocal) {
    const loaded = Boolean((posthog as any).__loaded)
    if (!loaded) {
      const uiHost = posthogHost.includes("eu.") ? "https://eu.posthog.com" : "https://app.posthog.com"
      posthog.init(posthogKey, {
        api_host: isLocal ? posthogHost : "/ingest",
        ui_host: uiHost,
        defaults: "2026-01-30",
        capture_pageview: false,
        capture_pageleave: "if_capture_pageview",
        autocapture: true,
        capture_exceptions: true,
        person_profiles: "identified_only",
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: {
            password: true,
          },
          maskTextClass: "ph-mask",
          blockClass: "ph-no-capture",
        },
        debug: posthogDebug,
      })
    }
  }
}
