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
  // ⚠ GOOGLE ANALYTICS WAS REMOVED FROM THIS LIST ON 2026-10-14, ALONG WITH THE TAG ITSELF.
  // It read `https://www.google-analytics.com`, and GA4 sends its beacon to the REGIONAL host
  // `region1.google-analytics.com` -- which that entry does not match, so every hit had been
  // refused in silence since the tag was added. Same family as the Sentry wildcard above: a CSP
  // mistake produces no error anywhere, so the data is simply absent and nothing says why.
  // PostHog covers this, so the tag was deleted instead of the policy widened. If GA ever comes
  // back it needs `https://*.google-analytics.com`, not the `www.` host, plus the privacy notice
  // and subprocessor entries restored.
]

export const CSP_DIRECTIVES = [
  "default-src 'self'",
  // va.vercel-scripts.com serves the Vercel Analytics script, which app/layout.tsx has been
  // rendering on every page while CSP silently refused to load it. Same shape as the malformed
  // Sentry ingest wildcard: the component mounts, the browser drops the script, nothing is
  // logged anywhere, and the dashboard shows no data for reasons no one can see. The beacon
  // itself posts to /_vercel/insights on this origin, so 'self' already covers it.
  // googletagmanager dropped with the GA4 tag it existed for -- nothing else loads a script from it.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  // Sentry Replay compresses payloads in a worker it builds from a blob. With no worker-src the
  // browser falls back to script-src, which has no blob:, so the worker was blocked outright --
  // and, being CSP, blocked in silence. replaysOnErrorSampleRate is 1.0, so this was on the path
  // of every session that hit an error.
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  // The googletagmanager pixel host went with GA4 on 2026-10-14. It was only ever here to let GA's
  // tracking pixel through; with no tag loading, allowing it grants a third party an image beacon
  // on every page for nothing.
  "img-src 'self' data: blob: https://cdn.weatherapi.com",
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC.join(" ")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]

export const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join("; ")
