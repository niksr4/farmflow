import { NextResponse } from "next/server"
import { z } from "zod"

import { buildRateLimitHeaders, checkRateLimit, isRateLimitUnavailableError } from "@/lib/rate-limit"
import { isDbConfigured } from "@/lib/server/db"
import { verifySignupToken } from "@/lib/server/onboarding/provision-tenant"
import { normalizeOnboardingError, SIGNUP_VERIFICATION_ALREADY_USED_MESSAGE } from "@/lib/server/onboarding/utils"
import { databaseNotConfiguredResponse } from "@/lib/server/route-utils"

const verifyBodySchema = z.object({
  token: z.string().trim().min(1, "Verification token is required"),
})

const getClientIpAddress = (request: Request) =>
  (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0]?.trim() || "unknown"

export async function POST(request: Request) {
  if (!isDbConfigured) {
    return databaseNotConfiguredResponse()
  }

  const ipAddress = getClientIpAddress(request)
  const body = await request.json().catch(() => ({}))
  const parsed = verifyBodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request body" }, { status: 400 })
  }

  let headers: Record<string, string> = {}
  try {
    const rateLimit = await checkRateLimit("authSignupVerify", `auth-signup-verify:${ipAddress}`)
    headers = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return NextResponse.json(
        { success: false, error: "Too many verification attempts. Please try again shortly." },
        { status: 429, headers },
      )
    }
  } catch (error) {
    if (isRateLimitUnavailableError(error)) {
      return NextResponse.json(
        { success: false, error: "Email verification is temporarily unavailable. Please try again shortly." },
        { status: 503 },
      )
    }
    throw error
  }

  try {
    const result = await verifySignupToken(parsed.data.token)
    return NextResponse.json(
      {
        success: true,
        email: result.email,
        tenantId: result.tenantId,
        tenantName: result.tenantName,
        userId: result.userId,
        username: result.username,
        loginIdentifier: result.loginIdentifier,
      },
      { headers },
    )
  } catch (error) {
    const normalizedError = normalizeOnboardingError(error)
    const message = normalizedError.message || "Failed to verify email"
    const status =
      message === "Verification token is required" || message === "Verification link is invalid" || message.includes("expired")
        ? 400
        : message === SIGNUP_VERIFICATION_ALREADY_USED_MESSAGE
          ? 409
        : message === "This email is already linked to another tenant"
          ? 409
          : 500

    return NextResponse.json({ success: false, error: message }, { status, headers })
  }
}
