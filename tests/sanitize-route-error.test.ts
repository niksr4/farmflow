import { describe, expect, it } from "vitest"

import { sanitizeRouteError } from "../lib/server/sanitize-route-error"

describe("sanitizeRouteError", () => {
  it("passes through short, non-internal messages unchanged", () => {
    expect(sanitizeRouteError(new Error("Owner role required"), "fallback")).toBe("Owner role required")
    expect(sanitizeRouteError(new Error("Invalid request body"), "fallback")).toBe("Invalid request body")
  })

  it("blocks messages that look like DB/internal errors", () => {
    expect(sanitizeRouteError(new Error('relation "users" does not exist'), "fallback")).toBe("fallback")
    expect(
      sanitizeRouteError(new Error('duplicate key value violates unique constraint "idx_users_username_normalized_unique"'), "fallback"),
    ).toBe("fallback")
    expect(sanitizeRouteError(new Error("ECONNREFUSED 127.0.0.1:5432"), "fallback")).toBe("fallback")
    expect(sanitizeRouteError(new Error("syntax error at or near SELECT"), "fallback")).toBe("fallback")
    expect(sanitizeRouteError(new Error("function lower(integer) does not exist"), "fallback")).toBe("fallback")
  })

  it("blocks overly long messages even if they look benign", () => {
    const longMessage = "a".repeat(201)
    expect(sanitizeRouteError(new Error(longMessage), "fallback")).toBe("fallback")
    const boundaryMessage = "a".repeat(200)
    expect(sanitizeRouteError(new Error(boundaryMessage), "fallback")).toBe(boundaryMessage)
  })

  it("falls back on empty/missing error messages", () => {
    expect(sanitizeRouteError(new Error(""), "fallback")).toBe("fallback")
    expect(sanitizeRouteError(null, "fallback")).toBe("fallback")
    expect(sanitizeRouteError(undefined, "fallback")).toBe("fallback")
  })

  it("handles non-Error thrown values via String() coercion", () => {
    expect(sanitizeRouteError("plain string reject reason", "fallback")).toBe("plain string reject reason")
    // Plain objects coerce via String() to "[object Object]" — not empty, not over the length
    // cap, and doesn't match the internal-pattern regex, so it passes through as-is. This is a
    // quirk of the current implementation (arguably it should always fall back for non-Error,
    // non-string values) rather than a deliberate safety guarantee — documented here so a
    // future change to this behavior is a conscious decision, not a silent regression.
    expect(sanitizeRouteError({ some: "object" }, "fallback")).toBe("[object Object]")
  })
})
