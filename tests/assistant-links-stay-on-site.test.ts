import { describe, expect, it } from "vitest"

import { isSafeInternalHref } from "../lib/ai-assistant"

/**
 * THE ASSISTANT'S LINKS ARE MODEL OUTPUT, so the href is attacker-influenced in the ordinary case:
 * anything that reaches the prompt -- a worker's name, a note, an activity label -- can shape what
 * comes back. Until the 2026-10-11 scan this was gated on `href.startsWith("/")` alone, which is
 * not a same-origin check:
 *
 *   "//evil.example"   is PROTOCOL-RELATIVE. The browser reads it as https://evil.example.
 *   "/\\evil.example"  is treated the same way by several browsers, backslash for slash.
 *
 * Both begin with "/" and both leave the site. The fix shipped without a test, which for a
 * security guard means the next person to simplify it back to one condition gets no warning --
 * so this exists to make that loud.
 */
describe("an assistant link cannot navigate off-site", () => {
  it("accepts ordinary in-app paths", () => {
    for (const href of ["/", "/dashboard", "/workspace?tab=muster", "/lot/abc#section"]) {
      expect(isSafeInternalHref(href), href).toBe(true)
    }
  })

  it("refuses protocol-relative hrefs, which start with a slash and still leave the site", () => {
    // The whole point: every one of these satisfies startsWith("/").
    for (const href of ["//evil.example", "//evil.example/path", "/\\evil.example", "/\\\\evil.example"]) {
      expect(isSafeInternalHref(href), href).toBe(false)
    }
  })

  it("refuses absolute and scheme-bearing hrefs", () => {
    for (const href of ["https://evil.example", "http://evil.example", "javascript:alert(1)", "data:text/html,x", "mailto:a@b.c"]) {
      expect(isSafeInternalHref(href), href).toBe(false)
    }
  })

  it("refuses anything that is not a rooted path at all", () => {
    for (const href of ["", "evil.example", "./relative", "../up"]) {
      expect(isSafeInternalHref(href), href).toBe(false)
    }
  })
})
