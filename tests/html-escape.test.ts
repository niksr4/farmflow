import { describe, expect, it } from "vitest"
import { escapeHtml, escapeHtmlAttributeUrl, sanitizeEmailHeaderValue } from "../lib/html-escape"

describe("escapeHtml", () => {
  it("neutralises a script tag", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    )
  })

  it("neutralises an image onerror payload", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    )
  })

  // The bug in the routes this replaces (NIK-5): they escaped < and > but not &, so an
  // attacker who pre-encoded their payload sailed through untouched and the mail client
  // decoded it back into a live tag. Escaping & first is what makes the rest work.
  it("escapes the ampersand first, closing the pre-encoded bypass", () => {
    expect(escapeHtml("&lt;img src=x onerror=alert(1)&gt;")).toBe(
      "&amp;lt;img src=x onerror=alert(1)&amp;gt;",
    )
  })

  it("does not double-decode on a second pass", () => {
    const once = escapeHtml("<b>")
    expect(escapeHtml(once)).toBe("&amp;lt;b&amp;gt;")
  })

  it("escapes quotes so a value is safe inside an attribute", () => {
    // Without this, `" onmouseover="alert(1)` closes href and appends a handler.
    expect(escapeHtml('" onmouseover="alert(1)')).toBe(
      "&quot; onmouseover=&quot;alert(1)",
    )
    expect(escapeHtml("it's")).toBe("it&#39;s")
  })

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Nikhil Chengappa")).toBe("Nikhil Chengappa")
    expect(escapeHtml("Coorg estate — 12 acres")).toBe("Coorg estate — 12 acres")
  })

  it("handles null and undefined without throwing", () => {
    expect(escapeHtml(null)).toBe("")
    expect(escapeHtml(undefined)).toBe("")
  })
})

describe("escapeHtmlAttributeUrl", () => {
  it("keeps a normal mailto address usable (percent-encoded, still opens the right address)", () => {
    // encodeURIComponent turns "@" into "%40" -- a compliant mailto: parser percent-decodes
    // this back to a normal address, so the link still works even though the literal string
    // changes. See the regression test below for why this can't be "@" left untouched.
    expect(escapeHtmlAttributeUrl("nik@example.com")).toBe("nik%40example.com")
  })

  it("stops an injected attribute breaking out of href", () => {
    const escaped = escapeHtmlAttributeUrl('x@y.com" onmouseover="alert(1)')
    expect(escaped).not.toContain('"')
  })

  it("percent-encodes characters that would be read as URL syntax", () => {
    // mailto:x@y?bcc=... would otherwise let a submitted address add mail headers.
    const escaped = escapeHtmlAttributeUrl("x@y.com<script>")
    expect(escaped).not.toContain("<")
  })

  // Regression test for a real gap: this function used to call `encodeURI`, which
  // deliberately leaves "?", "&", "=" and "@" unescaped (it's meant for encoding a
  // already-complete URL, not a value embedded inside one). That meant the exact
  // attack this file's own docstring describes -- mailto:x@y?bcc=attacker@evil.com --
  // passed straight through untouched. Found 2026-09-15; fixed by switching to
  // `encodeURIComponent`. This function has no call sites in the app today, so nothing
  // was actually exploitable yet, but it's an exported security helper and the gap
  // should be closed before something wires it up.
  it("neutralises a mailto header-injection payload (?bcc=...)", () => {
    const escaped = escapeHtmlAttributeUrl("x@y.com?bcc=attacker@evil.com")
    expect(escaped).not.toContain("?")
    expect(escaped).not.toContain("=")
    expect(`mailto:${escaped}`).toBe("mailto:x%40y.com%3Fbcc%3Dattacker%40evil.com")
  })

  it("neutralises an injected '&' that could chain a second mail header", () => {
    const escaped = escapeHtmlAttributeUrl("x@y.com&bcc=attacker@evil.com")
    expect(escaped).not.toContain("&")
  })
})

describe("sanitizeEmailHeaderValue", () => {
  it("strips CR/LF, the classic header-injection vector", () => {
    expect(sanitizeEmailHeaderValue("Subject\r\nBcc: attacker@evil.com")).toBe(
      "Subject Bcc: attacker@evil.com",
    )
    expect(sanitizeEmailHeaderValue("a\nb")).toBe("a b")
  })

  it("trims and collapses without altering ordinary subjects", () => {
    expect(sanitizeEmailHeaderValue("[FarmFlow Contact] Nikhil — General enquiry")).toBe(
      "[FarmFlow Contact] Nikhil — General enquiry",
    )
  })

  it("handles null and undefined", () => {
    expect(sanitizeEmailHeaderValue(null)).toBe("")
  })
})
