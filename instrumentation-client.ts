import posthog from "posthog-js"

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

if (posthogKey && posthogHost) {
  const uiHost = posthogHost.includes("eu.") ? "https://eu.posthog.com" : "https://app.posthog.com"

  posthog.init(posthogKey, {
    api_host: "/ingest",
    ui_host: uiHost,
    defaults: "2026-01-30",
    capture_pageview: "history_change",
    capture_pageleave: "if_capture_pageview",
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
    debug: process.env.NODE_ENV === "development",
  })
}
