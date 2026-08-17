// Content-Security-Policy directives, extracted from next.config.mjs so they can be
// unit-tested. A CSP mistake fails silently — the browser drops the request and nothing
// is logged server-side — so this file has a companion test (tests/csp.test.ts) that
// checks the policy actually permits the endpoints the app depends on.
//
// History: `connect-src` once listed `https://o*.ingest.sentry.io` for Sentry. That is not
// valid CSP host syntax (a wildcard is only legal as the entire leftmost label), so browsers
// discarded the entry, and it would not have matched the EU region host
// `o<org>.ingest.de.sentry.io` in any case. Every client-side Sentry event was blocked at
// the browser for months with no signal anywhere. Hence the test.

/**
 * Hosts the browser is allowed to send XHR/fetch/beacon traffic to.
 *
 * Sentry regions are listed explicitly rather than as one broad `*.sentry.io` so that a
 * DSN region change is a deliberate edit here, not a silent outage.
 */
export const CONNECT_SRC = [
  "'self'",
  "https://eu.i.posthog.com",
  "https://eu-assets.i.posthog.com",
  "https://*.ingest.sentry.io",
  "https://*.ingest.de.sentry.io",
  "https://*.ingest.us.sentry.io",
  "https://www.google-analytics.com",
  "https://www.googletagmanager.com",
]

export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
  // Sentry Replay compresses payloads in a worker it builds from a blob. With no worker-src the
  // browser falls back to script-src, which has no blob:, so the worker was blocked outright --
  // and, being CSP, blocked in silence. replaysOnErrorSampleRate is 1.0, so this was on the path
  // of every session that hit an error.
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  // googletagmanager is already trusted to run scripts and open connections here, so refusing
  // only its tracking pixel bought nothing and silently dropped analytics hits. Narrow addition
  // to a host the policy already permits far more from -- not a new origin.
  "img-src 'self' data: blob: https://cdn.weatherapi.com https://www.googletagmanager.com",
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC.join(" ")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]

export const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join("; ")
