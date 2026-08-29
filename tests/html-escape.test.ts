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
  it("keeps a normal mailto address usable", () => {
    expect(escapeHtmlAttributeUrl("nik@example.com")).toBe("nik@example.com")
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

  // Regression test: this function used to run the value through `encodeURI`, which
  // deliberately does NOT touch `?`, `&`, `=`, or `#` (it assumes its input is already a
  // full, valid URI). That meant the exact header-injection payload this function's own
  // docstring describes -- `mailto:x@y?bcc=attacker@evil` -- sailed through completely
  // unescaped. Assert the actual URL-syntax characters are neutralized, not just `<`/`"`.
  it("percent-encodes ? & = so a mailto value cannot add mail headers", () => {
    const escaped = escapeHtmlAttributeUrl("x@y.com?bcc=attacker@evil.com&subject=hi")
    expect(escaped).not.toContain("?")
    expect(escaped).not.toContain("&")
    expect(escaped).not.toContain("=")
    expect(escaped).toBe("x@y.com%3Fbcc%3Dattacker@evil.com%26subject%3Dhi")
  })

  it("still leaves an ordinary address byte-for-byte readable", () => {
    expect(escapeHtmlAttributeUrl("estate.manager@thefarmflow.in")).toBe(
      "estate.manager@thefarmflow.in",
    )
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
