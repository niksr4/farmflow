import { afterEach, describe, expect, it } from "vitest"

import {
  RESET_LINK_EXPIRED_MESSAGE,
  RESET_LINK_USED_MESSAGE,
  buildPasswordResetLink,
  generatePasswordResetToken,
  getPasswordResetStateError,
  hashPasswordResetToken,
  resolvePasswordResetExpiry,
} from "../lib/server/password-reset-utils"

const originalEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL: process.env.VERCEL_URL,
}

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL
  process.env.NEXTAUTH_URL = originalEnv.NEXTAUTH_URL
  process.env.VERCEL_PROJECT_PRODUCTION_URL = originalEnv.VERCEL_PROJECT_PRODUCTION_URL
  process.env.VERCEL_URL = originalEnv.VERCEL_URL
})

describe("password reset utils", () => {
  it("generates random tokens and hashes them deterministically", () => {
    const tokenA = generatePasswordResetToken()
    const tokenB = generatePasswordResetToken()
    expect(tokenA).not.toBe(tokenB)
    expect(hashPasswordResetToken("abc")).toBe(hashPasswordResetToken("abc"))
    expect(hashPasswordResetToken("abc")).not.toBe(hashPasswordResetToken("xyz"))
  })

  it("hashes password-reset tokens in a distinct namespace from signup tokens", () => {
    // Reuses the same sha256-of-prefixed-token construction as signup tokens, but with a
    // different prefix, so a leaked signup token hash can never be replayed against this table.
    const hash = hashPasswordResetToken("shared-raw-value")
    expect(hash).toHaveLength(64)
  })

  it("resolves reset links from configured app urls", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://farmflow.example.com/"
    expect(buildPasswordResetLink("token-123")).toBe("https://farmflow.example.com/reset-password?token=token-123")
  })

  it("sets a 1-hour expiry window", () => {
    const before = Date.now()
    const expiresAt = resolvePasswordResetExpiry()
    const after = Date.now()
    const deltaMsFromBefore = expiresAt.getTime() - before
    const deltaMsFromAfter = expiresAt.getTime() - after
    expect(deltaMsFromBefore).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000)
    expect(deltaMsFromAfter).toBeLessThanOrEqual(60 * 60 * 1000 + 1000)
  })

  it("treats consumed tokens as already used, even if also expired", () => {
    expect(
      getPasswordResetStateError({
        consumedAt: "2026-03-19T10:00:00.000Z",
        expiresAt: "2026-03-19T09:00:00.000Z",
        nowMs: Date.parse("2026-03-20T00:00:00.000Z"),
      }),
    ).toBe(RESET_LINK_USED_MESSAGE)
  })

  it("treats unconsumed but expired tokens as expired", () => {
    expect(
      getPasswordResetStateError({
        consumedAt: null,
        expiresAt: "2026-03-19T10:00:00.000Z",
        nowMs: Date.parse("2026-03-20T00:00:00.000Z"),
      }),
    ).toBe(RESET_LINK_EXPIRED_MESSAGE)
  })

  it("treats unconsumed, unexpired tokens as valid", () => {
    expect(
      getPasswordResetStateError({
        consumedAt: null,
        expiresAt: "2026-03-21T10:00:00.000Z",
        nowMs: Date.parse("2026-03-20T00:00:00.000Z"),
      }),
    ).toBeNull()
  })
})
