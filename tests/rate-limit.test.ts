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

  it("exposes a distinct error type for unavailable sensitive rate limiting", () => {
    const error = new RateLimitUnavailableError("authSignup")

    expect(isRateLimitUnavailableError(error)).toBe(true)
    expect(error.key).toBe("authSignup")
    expect(error.message).toContain("temporarily unavailable")
  })
})
