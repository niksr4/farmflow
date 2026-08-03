import "server-only"

import { createHash, randomBytes } from "crypto"

import { resolvePublicAppUrl } from "@/lib/server/onboarding/utils"

// 1 hour, matching the password reset link. Both grant control of the account if leaked — this
// one by moving where future reset links are delivered — so neither should outlive the sitting.
const EMAIL_CHANGE_TOKEN_TTL_MS = 60 * 60 * 1000

export const EMAIL_CHANGE_LINK_INVALID_MESSAGE = "This confirmation link is invalid. Request a new one."
export const EMAIL_CHANGE_LINK_USED_MESSAGE = "This confirmation link has already been used. Request a new one."
export const EMAIL_CHANGE_LINK_EXPIRED_MESSAGE = "This confirmation link has expired. Request a new one."
export const EMAIL_CHANGE_TAKEN_MESSAGE = "That email address is already in use by another account."
export const EMAIL_CHANGE_SAME_MESSAGE = "That is already your email address."

export const generateEmailChangeToken = () => randomBytes(32).toString("hex")

// Distinct salt prefix from the password-reset hasher on purpose: an email-change token must
// never be redeemable as a password-reset token (or vice versa) even though both are 32 random
// bytes stored as a sha256 hex digest.
export const hashEmailChangeToken = (token: string) =>
  createHash("sha256").update(`farmflow-email-change:${String(token || "").trim()}`).digest("hex")

export const buildEmailChangeLink = (token: string) =>
  `${resolvePublicAppUrl()}/verify-email-change?token=${encodeURIComponent(token)}`

export const resolveEmailChangeExpiry = () => new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS)

type EmailChangeTokenState = {
  consumedAt?: string | null
  expiresAt?: string | null
  nowMs?: number
}

export const getEmailChangeStateError = (input: EmailChangeTokenState) => {
  if (String(input.consumedAt || "").trim()) {
    return EMAIL_CHANGE_LINK_USED_MESSAGE
  }

  const expiresAt = new Date(String(input.expiresAt || "")).getTime()
  const nowMs = Number.isFinite(input.nowMs) ? Math.floor(Number(input.nowMs)) : Date.now()
  if (Number.isFinite(expiresAt) && expiresAt < nowMs) {
    return EMAIL_CHANGE_LINK_EXPIRED_MESSAGE
  }

  return null
}

/**
 * Postgres raises 23505 when the confirm-time UPDATE collides with
 * idx_users_normalized_email_unique — i.e. somebody else claimed the address in the window
 * between requesting the change and confirming it. That is a real race, not a bug: the
 * pre-check at request time cannot hold a lock for an hour.
 */
export const isDuplicateEmailError = (error: unknown) => {
  const code = String((error as { code?: string })?.code || "")
  if (code === "23505") return true
  const message = String((error as Error)?.message || error || "")
  return message.includes("idx_users_normalized_email_unique")
}
