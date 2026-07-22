import { NextResponse } from "next/server"
import { z } from "zod"

import { buildRateLimitHeaders, checkRateLimit, isRateLimitUnavailableError } from "@/lib/rate-limit"
import { isDbConfigured } from "@/lib/server/db"
import {
  RESET_LINK_INVALID_MESSAGE,
  RESET_LINK_EXPIRED_MESSAGE,
  RESET_LINK_USED_MESSAGE,
} from "@/lib/server/password-reset-utils"
import { resetPasswordWithToken } from "@/lib/server/password-reset"
import { databaseNotConfiguredResponse } from "@/lib/server/route-utils"

const resetPasswordBodySchema = z.object({
  token: z.string().trim().min(1, "Reset token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
})

const getClientIpAddress = (request: Request) =>
  (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0]?.trim() || "unknown"

export async function POST(request: Request) {
  if (!isDbConfigured) {
    return databaseNotConfiguredResponse()
  }

  const ipAddress = getClientIpAddress(request)
  const userAgent = request.headers.get("user-agent") || null
  const body = await request.json().catch(() => ({}))
  const parsed = resetPasswordBodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request body" }, { status: 400 })
  }

  let headers: Record<string, string> = {}
  try {
    const rateLimit = await checkRateLimit("authResetPassword", `auth-reset-password:${ipAddress}`)
    headers = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Please try again shortly." },
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
    const result = await resetPasswordWithToken({
      token: parsed.data.token,
      newPassword: parsed.data.newPassword,
      ipAddress,
      userAgent,
    })
    return NextResponse.json({ success: true, username: result.username }, { headers })
  } catch (error) {
    const message = (error as Error)?.message || "Failed to reset password"
    const status =
      message === RESET_LINK_INVALID_MESSAGE || message === "Reset token is required"
        ? 400
        : message === RESET_LINK_EXPIRED_MESSAGE
          ? 400
          : message === RESET_LINK_USED_MESSAGE
            ? 409
            : 500

    return NextResponse.json({ success: false, error: message }, { status, headers })
  }
}
