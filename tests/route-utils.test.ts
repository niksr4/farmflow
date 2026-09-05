import { describe, expect, it } from "vitest"

import { buildErrorResponse, databaseNotConfiguredResponse, getErrorMessage } from "@/lib/server/route-utils"

// Complements tests/auth-refusal-not-an-error.test.ts, which already covers isAuthRefusal and
// buildAdminErrorResponse in depth. This file covers the remaining untested exports.

describe("getErrorMessage", () => {
  it("passes through a known passthrough message unchanged, bypassing the sanitizer", () => {
    // These are short strings that sanitizeRouteError's length/pattern checks would let through
    // anyway, but they're listed explicitly (see the file's own comment) to be defensive.
    expect(getErrorMessage(new Error("Admin role required"), "fallback")).toBe("Admin role required")
    expect(getErrorMessage(new Error("Owner role required"), "fallback")).toBe("Owner role required")
    expect(getErrorMessage(new Error("Unauthorized"), "fallback")).toBe("Unauthorized")
    expect(getErrorMessage(new Error("Database not configured"), "fallback")).toBe("Database not configured")
  })

  it("sanitizes a message that looks like a DB internal", () => {
    expect(getErrorMessage(new Error('relation "users" does not exist'), "fallback")).toBe("fallback")
  })

  it("falls back to the provided fallback for an empty/missing message", () => {
    expect(getErrorMessage(new Error(""), "fallback")).toBe("fallback")
    expect(getErrorMessage(null, "fallback")).toBe("fallback")
  })

  it("extracts a message from a plain object error, not just a real Error", () => {
    expect(getErrorMessage({ message: "Unauthorized" }, "fallback")).toBe("Unauthorized")
  })
})

describe("buildErrorResponse", () => {
  it("statusByMessage takes precedence over forbiddenMessages and defaultStatus", async () => {
    const res = buildErrorResponse(new Error("Owner role required"), "fallback", {
      forbiddenMessages: ["Owner role required"],
      statusByMessage: { "Owner role required": 409 },
      defaultStatus: 500,
    })
    expect(res.status).toBe(409)
  })

  it("forbiddenMessages maps to 403 when statusByMessage doesn't cover the message", async () => {
    const res = buildErrorResponse(new Error("Owner role required"), "fallback", {
      forbiddenMessages: ["Owner role required"],
    })
    expect(res.status).toBe(403)
  })

  it("falls back to defaultStatus, then 500, when neither statusByMessage nor forbiddenMessages match", async () => {
    const withDefault = buildErrorResponse(new Error("boom"), "fallback", { defaultStatus: 422 })
    expect(withDefault.status).toBe(422)

    const withoutDefault = buildErrorResponse(new Error("boom"), "fallback", {})
    expect(withoutDefault.status).toBe(500)
  })

  it("puts the resolved message in the response body under { success: false, error }", async () => {
    const res = buildErrorResponse(new Error("Unauthorized"), "fallback", {})
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" })
  })
})

describe("databaseNotConfiguredResponse", () => {
  it("returns a 500 with the fixed 'Database not configured' message", async () => {
    const res = databaseNotConfiguredResponse()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ success: false, error: "Database not configured" })
  })
})
