import * as Sentry from "@sentry/nextjs"
import posthog from "posthog-js"

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "https://9ff9672ddc6ade0965e0a02e09f6cf3c@o4511210874339328.ingest.de.sentry.io/4511212832817232",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.01,
  ignoreErrors: [
    "Unauthorized",
    "Module access disabled",
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
  ],
  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
})

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
      const IGNORED_ERRORS = [
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications",
      ]

      posthog.init(posthogKey, {
        api_host: isLocal ? posthogHost : "/ingest",
        ui_host: uiHost,
        defaults: "2026-01-30",
        capture_pageview: false,
        capture_pageleave: "if_capture_pageview",
        autocapture: true,
        capture_exceptions: true,
        before_send: (event) => {
          if (!event) return null
          if (event.event === "$exception") {
            const exceptions = (event.properties as any)?.$exception_list as Array<{ value?: string }> | undefined
            if (exceptions?.some((e) => IGNORED_ERRORS.some((msg) => e.value?.includes(msg)))) {
              return null
            }
          }
          return event
        },
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
