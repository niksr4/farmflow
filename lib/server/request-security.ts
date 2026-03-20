import "server-only"

import { createHash, timingSafeEqual } from "crypto"

type HeaderSource = Headers | { get(name: string): string | null | undefined }

const digestSecret = (value: string) => Uint8Array.from(createHash("sha256").update(value).digest())

export const extractBearerToken = (headers: HeaderSource) => {
  const authHeader = String(headers.get("authorization") || "")
  if (!authHeader.startsWith("Bearer ")) {
    return ""
  }
  return authHeader.slice(7).trim()
}

export const extractSharedSecretToken = (headers: HeaderSource) =>
  String(headers.get("x-agent-token") || "").trim() || extractBearerToken(headers)

export const extractClientIp = (headers: HeaderSource) => {
  const forwarded = String(headers.get("x-forwarded-for") || "")
    .split(",")[0]
    ?.trim()
  if (forwarded) return forwarded
  const realIp = String(headers.get("x-real-ip") || "").trim()
  return realIp || null
}

export const sharedSecretMatches = (expectedSecret: string, providedSecret: string) => {
  if (!expectedSecret || !providedSecret) {
    return false
  }
  return timingSafeEqual(digestSecret(expectedSecret), digestSecret(providedSecret))
}
