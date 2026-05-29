"use client"

import { useReportWebVitals } from "next/web-vitals"

export default function WebVitals() {
  useReportWebVitals((metric) => {
    // CLS is a ratio (0–1), multiply by 1000 to match GA4 integer convention
    const value = Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value)

    // PostHog — uses the built-in $web_vitals event schema
    const ph = (window as any).posthog
    if (ph?.capture) {
      ph.capture("$web_vitals", {
        metric: metric.name,
        value,
        rating: metric.rating, // "good" | "needs-improvement" | "poor"
      })
    }

    // GA4 — fires as a standard event so it shows in reports
    const gtag = (window as any).gtag
    if (gtag) {
      gtag("event", metric.name, {
        event_category: "Web Vitals",
        value,
        event_label: metric.id,
        non_interaction: true,
      })
    }
  })

  return null
}
