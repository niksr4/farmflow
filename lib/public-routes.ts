// Public API routes: these authenticate by something other than a user session (shared
// secret, webhook signature, one-time email token) or are intentionally open, and are reached
// by unauthenticated visitors — so they skip the session gate in proxy.ts. Anything not listed
// here requires a valid session (the defence-in-depth backstop for routes that might forget
// their own guard). Kept as a pure, unit-tested module so the allowlist can't silently drift.
export const PUBLIC_API_PREFIXES = [
  "/api/auth", // next-auth, signup, verify-email, resend-verification, session
  "/api/register-interest", // public landing form
  "/api/contact", // public contact form (rate limited)
  "/api/cron/", // bearer CRON_SECRET
  "/api/ops/error-ingest", // shared LOG_INGEST_TOKEN
  "/api/lots/", // public lot traceability (QR codes, no login)
  "/api/digest/feedback", // one-time email feedback token
  "/api/billing/webhooks/", // provider webhook signature
] as const

// Match on path-segment boundaries so a prefix like "/api/contact" allows "/api/contact" and
// "/api/contact/…" but NOT an unrelated route such as "/api/contacts-list".
export const isPublicApiPath = (pathname: string): boolean =>
  PUBLIC_API_PREFIXES.some((prefix) => {
    const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix
    return pathname === base || pathname.startsWith(`${base}/`)
  })
