"use client"

import { useReportWebVitals } from "next/web-vitals"

export default function WebVitals() {
  useReportWebVitals((metric) => {
    // CLS is a ratio (0–1); multiply by 1000 so it lands as a useful integer alongside the
    // millisecond metrics rather than rounding to 0.
    const value = Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value)

    // PostHog — uses the built-in $web_vitals event schema.
    //
    // This used to also fire a GA4 `event` through window.gtag. GA was removed on 2026-10-14:
    // its beacon goes to the regional host region1.google-analytics.com, which CONNECT_SRC never
    // permitted, so every hit had been silently refused by CSP and GA had collected nothing.
    // PostHog carries the same data and is correctly allow-listed, so nothing was lost by
    // deleting GA rather than fixing the policy -- and it removed a subprocessor.
    const ph = (window as any).posthog
    if (ph?.capture) {
      ph.capture("$web_vitals", {
        metric: metric.name,
        value,
        rating: metric.rating, // "good" | "needs-improvement" | "poor"
      })
    }
  })

  return null
}
