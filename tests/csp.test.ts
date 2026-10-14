import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
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

  it("lets an already-trusted analytics host load its pixel", () => {
    // A host permitted for script-src and connect-src but not img-src is not a tighter policy,
    // just an inconsistent one -- it drops hits with no error anyone sees.
    const scriptHosts = /script-src ([^;]*)/.exec(CONTENT_SECURITY_POLICY)?.[1] ?? ""
    const imgHosts = /img-src ([^;]*)/.exec(CONTENT_SECURITY_POLICY)?.[1] ?? ""
    if (scriptHosts.includes("googletagmanager.com")) {
      expect(imgHosts).toContain("googletagmanager.com")
    }
  })

  /**
   * ⚠ THE SAME MISTAKE HAS NOW SHIPPED THREE TIMES, SO STOP WRITING ONE TEST PER INCIDENT.
   *
   *   1. `https://o*.ingest.sentry.io` -- not valid CSP host syntax, and the wrong region host
   *      anyway. Client-side Sentry reported nothing for months.
   *   2. Vercel Analytics rendered on every page while `script-src` refused its host.
   *   3. GA4 (removed 2026-10-14): `CONNECT_SRC` listed `https://www.google-analytics.com` while
   *      the beacon goes to `region1.google-analytics.com`.
   *
   * Every one is the same shape -- the app references a third-party host that the policy does not
   * permit -- and every one was invisible, because a CSP refusal is logged nowhere. So this derives
   * the host list FROM THE SOURCE instead of naming hosts, and a fourth instance fails here.
   *
   * Scoped to subresource references (`<Script src>`, preconnect, dns-prefetch) because those are
   * what CSP governs. A plain `<a href>` is a navigation and is none of CSP's business, which is
   * why the opt-out link that used to live in the privacy notice was never a finding.
   */
  it("permits every third-party host the app actually loads a subresource from", () => {
    /**
     * ⚠ PATHSPEC IS `app`, NOT `app/**\/*.tsx`. The glob form requires at least one directory
     * level, so it silently skips `app/layout.tsx` -- the single file that loaded all three of the
     * blocked subresources above. The vacuity assertion below is what caught that; without it this
     * test would have passed while scanning nothing, which is the failure mode it is guarding
     * against in the first place.
     */
    const sources = execFileSync("git", ["ls-files", "app", "components"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith(".tsx"))

    const referenced = new Set<string>()
    for (const file of sources) {
      const body = readFileSync(file, "utf8")
      // Script src="https://host/..."  and  <link rel="preconnect|dns-prefetch" href="https://host">
      for (const m of body.matchAll(/(?:<Script[^>]*?\ssrc|rel="(?:preconnect|dns-prefetch)"\s+href)="(https:\/\/[^"/]+)/g)) {
        referenced.add(m[1])
      }
    }

    // Sanity: if this finds nothing the test is vacuous and must fail loudly rather than pass.
    expect(
      referenced.size,
      "found no third-party subresource hosts at all -- the scan is broken, not the policy",
    ).toBeGreaterThan(0)

    const policy = CONTENT_SECURITY_POLICY
    const permitted = (host: string) => {
      const bare = host.replace(/^https:\/\//, "")
      if (policy.includes(host) || policy.includes(bare)) return true
      // A wildcard entry like https://*.ingest.de.sentry.io covers o123.ingest.de.sentry.io.
      return [...policy.matchAll(/https:\/\/\*\.([^\s;]+)/g)].some(([, suffix]) =>
        bare.endsWith(`.${suffix}`),
      )
    }

    const unpermitted = [...referenced].filter((h) => !permitted(h))
    expect(
      unpermitted,
      "these hosts are loaded by the app but not allowed by CSP, so the browser will drop them " +
        "silently and nothing will be logged anywhere. Add them to lib/csp.mjs or stop loading them.",
    ).toEqual([])
  })

  it("has no Google Analytics left anywhere in the policy", () => {
    // Removed 2026-10-14 because its beacon had always been refused and PostHog already covers it.
    // Pinned so a future edit cannot quietly re-add a host with no tag, or a tag with no host.
    expect(CONTENT_SECURITY_POLICY).not.toContain("google-analytics.com")
    expect(CONTENT_SECURITY_POLICY).not.toContain("googletagmanager.com")
    expect(readFileSync("app/layout.tsx", "utf8")).not.toMatch(/gtag|googletagmanager/)
  })

  it("lets Vercel Analytics load the script the app actually renders", () => {
    // app/layout.tsx renders <Analytics /> on every page. CSP refused the script host for its
    // whole life, so the component mounted and the browser dropped the request without a word --
    // the same silent shape as the ingest wildcard above. Caught by walking the tabs and reading
    // the console, which is the only place a CSP refusal ever appears.
    const layout = readFileSync(path.resolve(__dirname, "../app/layout.tsx"), "utf8")
    if (!/@vercel\/analytics/.test(layout)) return // component removed; nothing to permit

    const scriptHosts = /script-src ([^;]*)/.exec(CONTENT_SECURITY_POLICY)?.[1] ?? ""
    expect(scriptHosts).toContain("va.vercel-scripts.com")
  })

  it("contains no malformed partial-label wildcard in any directive", () => {
    // Catches `o*.host`, `api*.host` etc. anywhere in the policy, not just connect-src.
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/[A-Za-z0-9-]+\*\./)
  })
})
