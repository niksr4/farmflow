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

  it("classifies the forgot-password IP guard as sensitive but not the signup IP guard", () => {
    // Characterisation test: documents an inconsistency, not an intended design.
    // authForgotPasswordIp and authSignupIp are the same kind of control — a per-IP guard on a
    // public auth endpoint — but only the former fails closed. authSignupIp alone would fail
    // open if the counter store were unavailable. Not currently reachable, because the signup
    // route runs the sensitive authSignup check immediately afterwards and that still fails
    // closed. See findings_log.md, cycle 1 files 31-45.
    expect(isSensitiveRateLimitKey("authForgotPasswordIp")).toBe(true)
    expect(isSensitiveRateLimitKey("authSignupIp")).toBe(false)

    expect(requiresDistributedRateLimit("authForgotPasswordIp", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(
      true,
    )
    expect(requiresDistributedRateLimit("authSignupIp", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false)
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
