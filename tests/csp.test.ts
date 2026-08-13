import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
// Shared with next.config.mjs — the config is the thing under test, not a copy of it.
import { CONNECT_SRC, CONTENT_SECURITY_POLICY } from "../lib/csp.mjs"

/**
 * Minimal CSP host-source matcher following the CSP3 grammar:
 *
 *   host-part = "*" / [ "*." ] 1*host-char *( "." 1*host-char )
 *
 * The wildcard is only legal as the ENTIRE leftmost label. A partial prefix such as
 * `o*.ingest.sentry.io` is invalid and browsers discard the whole source expression —
 * which is exactly the bug this suite exists to prevent.
 */
function hostSourceMatches(source: string, url: string): boolean {
  if (source === "'self'" || source.startsWith("'")) return false

  const target = new URL(url)
  const withScheme = source.includes("://") ? source : `https://${source}`
  const parsed = new URL(withScheme)

  if (parsed.protocol !== target.protocol) return false

  const sourceHost = parsed.hostname
  const targetHost = target.hostname

  if (sourceHost === "*") return true

  if (sourceHost.includes("*")) {
    // Only a leading "*." is valid; anything else is malformed and matches nothing.
    if (!sourceHost.startsWith("*.")) return false
    if (sourceHost.slice(2).includes("*")) return false
    const suffix = sourceHost.slice(1) // ".ingest.de.sentry.io"
    // "*." matches exactly one or more leading labels, never zero.
    return targetHost.endsWith(suffix) && targetHost.length > suffix.length
  }

  return sourceHost === targetHost
}

const connectSrcAllows = (url: string): boolean =>
  (CONNECT_SRC as string[]).some((source) => hostSourceMatches(source, url))

/** The DSN the browser SDK actually ships to, read from the live config. */
function sentryDsnFromClientConfig(): string {
  const file = readFileSync(
    path.resolve(__dirname, "../instrumentation-client.ts"),
    "utf8",
  )
  const match = file.match(/dsn:[^"]*"(https:\/\/[^"]+)"/)
  if (!match) throw new Error("Could not find a Sentry DSN in instrumentation-client.ts")
  return match[1]
}

/** Strip the DSN's public key to get the ingest origin the browser connects to. */
function dsnToIngestOrigin(dsn: string): string {
  const url = new URL(dsn)
  return `${url.protocol}//${url.hostname}`
}

describe("CSP host-source matcher", () => {
  it("matches an exact host", () => {
    expect(hostSourceMatches("https://example.com", "https://example.com/x")).toBe(true)
    expect(hostSourceMatches("https://example.com", "https://other.com/x")).toBe(false)
  })

  it("matches a leading-label wildcard against one or more labels", () => {
    expect(hostSourceMatches("https://*.example.com", "https://a.example.com/x")).toBe(true)
    expect(hostSourceMatches("https://*.example.com", "https://a.b.example.com/x")).toBe(true)
    // "*." requires at least one label — the bare apex does not match.
    expect(hostSourceMatches("https://*.example.com", "https://example.com/x")).toBe(false)
  })

  it("rejects a partial-label wildcard, the way browsers do", () => {
    // The original bug: `o*.ingest.sentry.io` is not valid CSP host syntax.
    expect(hostSourceMatches("https://o*.ingest.sentry.io", "https://o123.ingest.sentry.io/x")).toBe(
      false,
    )
  })

  it("does not let a wildcard span an inserted label", () => {
    // Why the EU DSN was blocked even ignoring the syntax error.
    expect(
      hostSourceMatches("https://*.ingest.sentry.io", "https://o123.ingest.de.sentry.io/x"),
    ).toBe(false)
  })

  it("requires the scheme to match", () => {
    expect(hostSourceMatches("https://example.com", "http://example.com/x")).toBe(false)
  })
})

describe("connect-src covers everything the browser talks to", () => {
  // The regression that motivated this file: client-side Sentry was silently dead in
  // production because connect-src did not permit the DSN's host.
  it("permits the Sentry DSN configured in instrumentation-client.ts", () => {
    const origin = dsnToIngestOrigin(sentryDsnFromClientConfig())
    expect(connectSrcAllows(`${origin}/api/1/envelope/`)).toBe(true)
  })

  it("permits the EU Sentry ingest region", () => {
    expect(connectSrcAllows("https://o4511210874339328.ingest.de.sentry.io/api/1/envelope/")).toBe(
      true,
    )
  })

  it("permits PostHog's first-party ingest rewrite via 'self'", () => {
    // PostHog runs through the /ingest rewrite in production, so 'self' covers it.
    expect((CONNECT_SRC as string[]).includes("'self'")).toBe(true)
  })

  it("still refuses an unrelated origin", () => {
    expect(connectSrcAllows("https://evil.example.com/collect")).toBe(false)
  })
})

describe("assembled policy", () => {
  it("keeps the directives the app relies on", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'")
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src")
  })

  it("lets Sentry Replay build its compression worker from a blob", () => {
    // No worker-src means the browser falls back to script-src, which has no blob:, and the
    // worker is refused without a word in any log. Same silent-failure shape as the malformed
    // ingest wildcard that kept client-side Sentry dark for months.
    expect(CONTENT_SECURITY_POLICY).toMatch(/worker-src [^;]*\bblob:/)
  })

  it("contains no malformed partial-label wildcard in any directive", () => {
    // Catches `o*.host`, `api*.host` etc. anywhere in the policy, not just connect-src.
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/[A-Za-z0-9-]+\*\./)
  })
})
