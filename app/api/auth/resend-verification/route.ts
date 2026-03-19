import { NextResponse } from "next/server"
import { z } from "zod"

import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { isDbConfigured } from "@/lib/server/db"
import { resendSignupVerification } from "@/lib/server/onboarding/signup"
import { SIGNUP_EMAIL_PATTERN, normalizeOnboardingError, normalizeSignupEmail } from "@/lib/server/onboarding/utils"
import { databaseNotConfiguredResponse } from "@/lib/server/route-utils"

const resendBodySchema = z.object({
  email: z.string().trim().min(1, "Email is required").max(160, "Email is too long"),
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
  const parsed = resendBodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request body" }, { status: 400 })
  }

  const email = normalizeSignupEmail(parsed.data.email)
  if (!SIGNUP_EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 })
  }

  const rateLimit = await checkRateLimit("authSignupResend", `auth-signup-resend:${ipAddress}::${email}`)
  const headers = buildRateLimitHeaders(rateLimit)
  if (!rateLimit.success) {
    return NextResponse.json({ success: false, error: "Too many resend attempts. Please try again shortly." }, { status: 429, headers })
  }

  try {
    const result = await resendSignupVerification({
      email,
      ipAddress,
      userAgent,
    })

    return NextResponse.json(
      {
        success: true,
        email: result.email,
        maskedEmail: result.maskedEmail,
        verificationSent: result.verificationSent,
      },
      { headers },
    )
  } catch (error) {
    const normalizedError = normalizeOnboardingError(error)
    const message = normalizedError.message || "Failed to resend verification email"
    const status =
      message === "No pending signup found for this email"
        ? 404
        : message === "This account is already verified. Sign in instead."
          ? 409
          : message.includes("Unable to send verification email")
            ? 502
            : 400

    return NextResponse.json({ success: false, error: message }, { status, headers })
  }
}

