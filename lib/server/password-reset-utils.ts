import "server-only"

import { createHash, randomBytes } from "crypto"

import { resolvePublicAppUrl } from "@/lib/server/onboarding/utils"

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour — shorter than the 24h signup link, this grants account takeover if leaked

export const RESET_LINK_INVALID_MESSAGE = "Reset link is invalid. Request a new one."
export const RESET_LINK_USED_MESSAGE = "This reset link has already been used. Request a new one."
export const RESET_LINK_EXPIRED_MESSAGE = "Reset link has expired. Request a new one."

export const generatePasswordResetToken = () => randomBytes(32).toString("hex")

export const hashPasswordResetToken = (token: string) =>
  createHash("sha256").update(`farmflow-password-reset:${String(token || "").trim()}`).digest("hex")

export const buildPasswordResetLink = (token: string) =>
  `${resolvePublicAppUrl()}/reset-password?token=${encodeURIComponent(token)}`

export const resolvePasswordResetExpiry = () => new Date(Date.now() + RESET_TOKEN_TTL_MS)

type ResetTokenState = {
  consumedAt?: string | null
  expiresAt?: string | null
  nowMs?: number
}

export const getPasswordResetStateError = (input: ResetTokenState) => {
  if (String(input.consumedAt || "").trim()) {
    return RESET_LINK_USED_MESSAGE
  }

  const expiresAt = new Date(String(input.expiresAt || "")).getTime()
  const nowMs = Number.isFinite(input.nowMs) ? Math.floor(Number(input.nowMs)) : Date.now()
  if (Number.isFinite(expiresAt) && expiresAt < nowMs) {
    return RESET_LINK_EXPIRED_MESSAGE
  }

  return null
}
