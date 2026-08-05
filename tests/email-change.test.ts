import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  EMAIL_CHANGE_LINK_EXPIRED_MESSAGE,
  EMAIL_CHANGE_LINK_USED_MESSAGE,
  buildEmailChangeLink,
  generateEmailChangeToken,
  getEmailChangeStateError,
  hashEmailChangeToken,
  isDuplicateEmailError,
  resolveEmailChangeExpiry,
} from "../lib/server/email-change-utils"
import { hashPasswordResetToken } from "../lib/server/password-reset-utils"
import { PUBLIC_API_PREFIXES } from "../lib/public-routes"

const NOW = 1_800_000_000_000

describe("email change tokens", () => {
  it("issues high-entropy, non-repeating tokens", () => {
    const a = generateEmailChangeToken()
    const b = generateEmailChangeToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it("stores only a hash, and never the token itself", () => {
    const token = generateEmailChangeToken()
    const hash = hashEmailChangeToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
  })

  it("cannot be redeemed as a password-reset token", () => {
    // Both are 32 random bytes hashed to sha256 hex. Without distinct salt prefixes, a token
    // issued for one flow would look up cleanly in the other's table.
    const token = generateEmailChangeToken()
    expect(hashEmailChangeToken(token)).not.toBe(hashPasswordResetToken(token))
  })

  it("expires in an hour, matching the password reset link", () => {
    const ttl = resolveEmailChangeExpiry().getTime() - Date.now()
    expect(ttl).toBeGreaterThan(59 * 60_000)
    expect(ttl).toBeLessThanOrEqual(60 * 60_000)
  })

  it("rejects a consumed link", () => {
    expect(
      getEmailChangeStateError({ consumedAt: "2026-08-03T10:00:00Z", expiresAt: "2100-01-01T00:00:00Z", nowMs: NOW }),
    ).toBe(EMAIL_CHANGE_LINK_USED_MESSAGE)
  })

  it("rejects an expired link", () => {
    expect(getEmailChangeStateError({ consumedAt: null, expiresAt: "2020-01-01T00:00:00Z", nowMs: NOW })).toBe(
      EMAIL_CHANGE_LINK_EXPIRED_MESSAGE,
    )
  })

  it("accepts a live, unconsumed link", () => {
    expect(getEmailChangeStateError({ consumedAt: null, expiresAt: "2100-01-01T00:00:00Z", nowMs: NOW })).toBeNull()
  })

  it("does not treat a missing or malformed expires_at as expired (known edge case)", () => {
    // new Date("").getTime() and new Date(undefined).getTime() are both NaN, so
    // Number.isFinite(expiresAt) is false and the expiry check is skipped entirely — a token
    // row with a null/malformed expires_at is treated as never expiring rather than rejected.
    // In practice expires_at is always set by resolveEmailChangeExpiry() at insert time, so this
    // is currently unreachable via the app's own write path, but it's a silent fail-open if that
    // ever changes (e.g. a manual DB edit, a future code path that inserts without it). Worth
    // deciding whether this should fail closed instead. See findings_log.md, files 428-442/729.
    expect(getEmailChangeStateError({ consumedAt: null, expiresAt: undefined, nowMs: NOW })).toBeNull()
    expect(getEmailChangeStateError({ consumedAt: null, expiresAt: "", nowMs: NOW })).toBeNull()
    expect(getEmailChangeStateError({ consumedAt: null, expiresAt: "not-a-date", nowMs: NOW })).toBeNull()
  })

  it("url-encodes the token into the confirmation link", () => {
    expect(buildEmailChangeLink("a b+c")).toContain("token=a%20b%2Bc")
  })

  it("recognises the unique-index violation raised by a confirm-time race", () => {
    expect(isDuplicateEmailError({ code: "23505" })).toBe(true)
    expect(isDuplicateEmailError(new Error('duplicate key value violates unique constraint "idx_users_normalized_email_unique"'))).toBe(true)
    expect(isDuplicateEmailError(new Error("connection reset"))).toBe(false)
  })
})

describe("email change flow wiring", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

  it("requires the current password to start a change", () => {
    // A stolen session must not be enough to move where future password-reset links land.
    const src = read("app/api/account/email/route.ts")
    expect(src).toContain("verifyPassword")
    expect(src).toContain("currentPassword")
  })

  it("moves email, normalized_email and email_verified_at together", () => {
    // email alone breaks password reset (which looks up normalized_email); leaving
    // email_verified_at stale would vouch for the new address using the old one's verification.
    const src = read("lib/server/email-change.ts")
    const update = src.slice(src.indexOf("UPDATE users"))
    expect(update).toContain("email =")
    expect(update).toContain("normalized_email =")
    expect(update).toContain("email_verified_at =")
  })

  it("consumes the token before touching the user row", () => {
    // Two clicks on one link race here; the conditional consume is what makes exactly one win.
    const src = read("lib/server/email-change.ts")
    expect(src).toContain("AND consumed_at IS NULL")
    expect(src.indexOf("SET consumed_at = CURRENT_TIMESTAMP")).toBeLessThan(src.indexOf("UPDATE users"))
  })

  it("notifies the old address so a takeover is visible to the real owner", () => {
    expect(read("lib/server/email-change.ts")).toContain("sendEmailChangeNotice")
  })

  it("voids any outstanding request when a new one is issued", () => {
    const src = read("lib/server/email-change.ts")
    expect(src).toContain("UPDATE email_change_tokens")
    expect(src).toContain("WHERE user_id =")
  })

  it("keeps the confirm endpoint publicly reachable", () => {
    // Opened from the new mailbox, often on a device with no session — same reason
    // verify-email and reset-password live under the public /api/auth prefix.
    expect(PUBLIC_API_PREFIXES).toContain("/api/auth")
    expect(read("app/api/auth/confirm-email-change/route.ts")).toContain("confirmEmailChange")
  })

  it("exposes the page to every role, including writers", () => {
    // app/settings/page.tsx bounces role=user; the email page must sit outside that redirect
    // or "change your own email" quietly excludes writers.
    expect(read("app/settings/email/page.tsx")).not.toContain('role === "user"')
    expect(read("app/settings/page.tsx")).toContain('role === "user"')
  })
})
