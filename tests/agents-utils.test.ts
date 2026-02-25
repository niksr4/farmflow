import { describe, expect, it } from "vitest"
import { buildErrorFingerprint, normalizeMessage, parseBooleanLike } from "../lib/server/agents/utils"

describe("agents utils", () => {
  it("normalizes dynamic tokens in messages", () => {
    const input = "Route /api/sales failed for tenant 123e4567-e89b-12d3-a456-426614174000 with code 500"
    const normalized = normalizeMessage(input)
    expect(normalized).toContain("<uuid>")
    expect(normalized).toContain("<n>")
  })

  it("builds stable fingerprints", () => {
    const fpA = buildErrorFingerprint({
      source: "dispatch",
      code: "500",
      endpoint: "/api/dispatch",
      message: "Timeout after 30000 ms for tenant 111",
    })
    const fpB = buildErrorFingerprint({
      source: "dispatch",
      code: "500",
      endpoint: "/api/dispatch",
      message: "Timeout after 1000 ms for tenant 222",
    })
    expect(fpA).toBe(fpB)
  })

  it("parses boolean-like values", () => {
    expect(parseBooleanLike("true")).toBe(true)
    expect(parseBooleanLike("1")).toBe(true)
    expect(parseBooleanLike("yes")).toBe(true)
    expect(parseBooleanLike("false")).toBe(false)
  })
})
