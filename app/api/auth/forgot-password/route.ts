import { NextResponse } from "next/server"
import { z } from "zod"

import { buildRateLimitHeaders, checkRateLimit, isRateLimitUnavailableError } from "@/lib/rate-limit"
import { isDbConfigured } from "@/lib/server/db"
import { requestPasswordReset } from "@/lib/server/password-reset"
import { databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { logServerWarning } from "@/lib/server/safe-logging"

const forgotPasswordBodySchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username").max(160, "Too long"),
})

const getClientIpAddress = (request: Request) =>
  (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0]?.trim() || "unknown"

// Always the same generic response, whether or not the account exists — this endpoint must
// not be usable to enumerate registered emails/usernames.
const GENERIC_SUCCESS_MESSAGE = "If an account exists for that email or username, we've sent a password reset link."

export async function POST(request: Request) {
  if (!isDbConfigured) {
    return databaseNotConfiguredResponse()
  }

  const ipAddress = getClientIpAddress(request)
  const userAgent = request.headers.get("user-agent") || null
  const body = await request.json().catch(() => ({}))
  const parsed = forgotPasswordBodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request body" }, { status: 400 })
  }

  const identifier = parsed.data.identifier.trim()

  let headers: Record<string, string> = {}
  try {
    const ipLimit = await checkRateLimit("authForgotPasswordIp", `auth-forgot-password-ip:${ipAddress}`)
    if (!ipLimit.success) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429, headers: buildRateLimitHeaders(ipLimit) },
      )
    }
    const rateLimit = await checkRateLimit("authForgotPassword", `auth-forgot-password:${ipAddress}::${identifier.toLowerCase()}`)
    headers = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again shortly." },
        { status: 429, headers },
      )
    }
  } catch (error) {
    if (isRateLimitUnavailableError(error)) {
      return NextResponse.json(
        { success: false, error: "Password reset is temporarily unavailable. Please try again shortly." },
        { status: 503 },
      )
    }
    throw error
  }

  try {
    await requestPasswordReset({ identifier, ipAddress, userAgent })
  } catch (error) {
    // Never surface internal failures to the caller — same generic response either way — but
    // log so a broken email provider doesn't fail silently forever.
    logServerWarning("Failed to process forgot-password request", error)
  }

  return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE }, { headers })
}
