import { describe, expect, it } from "vitest"

import {
  extractBearerToken,
  extractClientIp,
  extractSharedSecretToken,
  sharedSecretMatches,
} from "../lib/server/request-security"

const headersFrom = (map: Record<string, string>) => ({
  get: (name: string) => map[name.toLowerCase()] ?? null,
})

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Authorization header", () => {
    expect(extractBearerToken(headersFrom({ authorization: "Bearer abc123" }))).toBe("abc123")
  })

  it("trims surrounding whitespace on the token", () => {
    expect(extractBearerToken(headersFrom({ authorization: "Bearer   abc123  " }))).toBe("abc123")
  })

  it("returns empty string when the header is missing or malformed", () => {
    expect(extractBearerToken(headersFrom({}))).toBe("")
    expect(extractBearerToken(headersFrom({ authorization: "Basic abc123" }))).toBe("")
    expect(extractBearerToken(headersFrom({ authorization: "" }))).toBe("")
  })
})

describe("extractSharedSecretToken", () => {
  it("prefers x-agent-token over the Authorization bearer token", () => {
    expect(
      extractSharedSecretToken(headersFrom({ "x-agent-token": "agent-token", authorization: "Bearer bearer-token" })),
    ).toBe("agent-token")
  })

  it("falls back to the bearer token when x-agent-token is absent", () => {
    expect(extractSharedSecretToken(headersFrom({ authorization: "Bearer bearer-token" }))).toBe("bearer-token")
  })

  it("returns empty string when neither header is present", () => {
    expect(extractSharedSecretToken(headersFrom({}))).toBe("")
  })
})

describe("extractClientIp", () => {
  it("prefers the first entry of x-forwarded-for over x-real-ip", () => {
    expect(
      extractClientIp(headersFrom({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "9.9.9.9" })),
    ).toBe("1.2.3.4")
  })

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(extractClientIp(headersFrom({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9")
  })

  it("returns null when neither header is present", () => {
    expect(extractClientIp(headersFrom({}))).toBeNull()
  })

  it("trims whitespace around the forwarded IP", () => {
    expect(extractClientIp(headersFrom({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" }))).toBe("1.2.3.4")
  })
})

describe("sharedSecretMatches", () => {
  it("returns true for matching secrets", () => {
    expect(sharedSecretMatches("same-secret", "same-secret")).toBe(true)
  })

  it("returns false for non-matching secrets", () => {
    expect(sharedSecretMatches("expected-secret", "wrong-secret")).toBe(false)
  })

  it("returns false when either side is empty", () => {
    expect(sharedSecretMatches("", "provided")).toBe(false)
    expect(sharedSecretMatches("expected", "")).toBe(false)
    expect(sharedSecretMatches("", "")).toBe(false)
  })

  it("is not vulnerable to trivial length-based short-circuiting (compares fixed-length digests)", () => {
    // Both differ from the expected secret but at different lengths — since the comparison
    // hashes both sides to a fixed-length digest before timingSafeEqual, this doesn't throw
    // (an un-hashed timingSafeEqual on differing-length buffers would throw a RangeError).
    expect(sharedSecretMatches("expected-secret", "x")).toBe(false)
    expect(sharedSecretMatches("expected-secret", "x".repeat(500))).toBe(false)
  })
})
