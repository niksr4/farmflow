import * as Sentry from "@sentry/nextjs"
import posthog from "posthog-js"

import { redactText } from "@/lib/redaction"
import { resolveRelease, scrubSentryEvent } from "@/lib/observability"

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

// This is the browser entry point on SDK v9+. The legacy `sentry.client.config.ts` is NOT
// loaded by this version — it was deleted rather than left as a decoy, because edits to it
// silently did nothing.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "https://9ff9672ddc6ade0965e0a02e09f6cf3c@o4511210874339328.ingest.de.sentry.io/4511212832817232",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  // Ties browser issues to a deploy so a regression is distinguishable from a standing bug.
  release: resolveRelease(),

  tracesSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.01,
  ignoreErrors: [
    "Unauthorized",
    "Module access disabled",
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    // Cancelled reads are intentional (see lib/abortable.ts) and must never look like faults.
    "AbortError",
    "The operation was aborted",
    // Backgrounding a mobile PWA mid-request surfaces as a generic network failure.
    "Load failed",
    "NetworkError when attempting to fetch resource",
  ],
  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],

  // Same scrubbing rules the server uses — the browser previously sent error text verbatim.
  beforeSend: (event) => scrubSentryEvent(event, redactText),
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
        /**
         * ⚠ REPLAY WAS RECORDING WORKER BANK ACCOUNTS, IFSC CODES AND PHONE NUMBERS AS READABLE
         * TEXT, and `maskAllInputs: true` did not stop it.
         *
         * maskAllInputs masks what somebody TYPES. It does nothing for what the app DISPLAYS, and
         * FarmFlow is almost entirely tables of worker and financial data:
         * components/worker-profiles-tab.tsx renders 78 PII values, payroll-summary-tab 9,
         * sales-tab 3. Nobody typed those; the roster rendered them. Medappa alone has 43 workers
         * with a real account number, IFSC and phone.
         *
         * `maskTextClass: "ph-mask"` and `blockClass: "ph-no-capture"` were configured here and
         * used in ZERO files -- checked across app/ and components/ on 2026-10-20. The
         * configuration looked like coverage and masked nothing beyond inputs.
         *
         * WHY `maskTextSelector: "*"` RATHER THAN A LIST OF SELECTORS: because the list is not
         * knowable. Two separate audits enumerated the PII columns and both came up short -- the
         * derived version added sales_records.bank_account, other_sales_records.bank_account,
         * buyers.email/phone, users.email/normalized_email/digest_email and
         * billing_invoices.bill_to_address on top of the worker fields. An allow-list of masked
         * selectors fails OPEN for every column somebody adds next month, and this is personal
         * data under the DPDP Act. Deny by default.
         *
         * WHAT IS LOST, and why it is affordable: replay now shows layout, navigation and where
         * clicks landed, with text redacted. That is most of the debugging value for "the app
         * broke on screen X" -- and since #116 the failing TAB is tagged in Sentry by name, so
         * replay no longer has to carry the text to tell us which screen died.
         *
         * ⚠ THIS ONLY AFFECTS RECORDINGS FROM HERE ON. Anything already captured while replay was
         * enabled still contains the cleartext and has to be dealt with in the PostHog dashboard.
         */
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: {
            password: true,
          },
          // Every text node, not a list of selectors somebody has to remember to extend.
          maskTextSelector: "*",
          maskTextClass: "ph-mask",
          blockClass: "ph-no-capture",
        },
        debug: posthogDebug,
      })
    }
  }
}
