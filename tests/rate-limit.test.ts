import { describe, expect, it } from "vitest"

import {
  isRateLimitUnavailableError,
  isSensitiveRateLimitKey,
  RateLimitUnavailableError,
  requiresDistributedRateLimit,
} from "../lib/rate-limit"

describe("rate limit policy", () => {
  it("marks sensitive production routes as requiring distributed rate limits", () => {
    expect(isSensitiveRateLimitKey("authLogin")).toBe(true)
    expect(isSensitiveRateLimitKey("authSignup")).toBe(true)
    expect(isSensitiveRateLimitKey("news")).toBe(false)

    expect(requiresDistributedRateLimit("authLogin", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true)
    expect(requiresDistributedRateLimit("authLogin", { NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false)
    expect(requiresDistributedRateLimit("weather", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false)
  })

  it("classifies every unauthenticated auth entry point as sensitive", () => {
    // Sensitive keys fail closed (RateLimitUnavailableError) when the counter store is down;
    // everything else silently fails open. These are the public, pre-session endpoints.
    expect(isSensitiveRateLimitKey("authSignup")).toBe(true)
    expect(isSensitiveRateLimitKey("authSignupResend")).toBe(true)
    expect(isSensitiveRateLimitKey("authSignupVerify")).toBe(true)
    expect(isSensitiveRateLimitKey("authForgotPassword")).toBe(true)
    expect(isSensitiveRateLimitKey("authResetPassword")).toBe(true)
    expect(isSensitiveRateLimitKey("accountPasswordChange")).toBe(true)
  })

  it("treats both per-IP auth guards as sensitive", () => {
    // authForgotPasswordIp and authSignupIp are the same kind of control — a per-IP guard on a
    // public auth endpoint, same 15/hour limit — so they must fail the same way. authSignupIp
    // used to fail *open*, which this test previously recorded as a known inconsistency.
    //
    // It was never exploitable: app/api/auth/signup/route.ts runs authSignupIp and then the
    // fail-closed authSignup on the next line, so an unavailable counter store blocked signup
    // either way. The fix is defence in depth — it removes a trap for whoever reorders or
    // removes that second check, since nothing else would have flagged the per-IP cap silently
    // disappearing. Failing closed costs nothing real: the counter store is the app's own
    // database, and provisioning a tenant needs it anyway.
    expect(isSensitiveRateLimitKey("authForgotPasswordIp")).toBe(true)
    expect(isSensitiveRateLimitKey("authSignupIp")).toBe(true)

    for (const key of ["authForgotPasswordIp", "authSignupIp"] as const) {
      expect(requiresDistributedRateLimit(key, { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true)
    }
  })

  it("never requires distributed rate limiting outside production", () => {
    for (const env of ["development", "test"]) {
      expect(requiresDistributedRateLimit("authSignup", { NODE_ENV: env } as NodeJS.ProcessEnv)).toBe(false)
      expect(requiresDistributedRateLimit("authResetPassword", { NODE_ENV: env } as NodeJS.ProcessEnv)).toBe(false)
    }
  })

  it("exposes a distinct error type for unavailable sensitive rate limiting", () => {
    const error = new RateLimitUnavailableError("authSignup")

    expect(isRateLimitUnavailableError(error)).toBe(true)
    expect(error.key).toBe("authSignup")
    expect(error.message).toContain("temporarily unavailable")
  })
})
