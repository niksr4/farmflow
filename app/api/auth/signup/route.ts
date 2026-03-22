import { NextResponse } from "next/server"
import { z } from "zod"

import { buildRateLimitHeaders, checkRateLimit, isRateLimitUnavailableError } from "@/lib/rate-limit"
import { isDbConfigured } from "@/lib/server/db"
import { createOrRefreshSignupRequest } from "@/lib/server/onboarding/signup"
import { SIGNUP_EMAIL_PATTERN, normalizeOnboardingError, normalizeSignupEmail } from "@/lib/server/onboarding/utils"
import { databaseNotConfiguredResponse } from "@/lib/server/route-utils"

const signupBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  email: z.string().trim().min(1, "Email is required").max(160, "Email is too long"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  estateName: z.string().trim().min(1, "Estate name is required").max(160, "Estate name is too long"),
  country: z.string().trim().max(120, "Country is too long").optional().default(""),
  preferredLocale: z.string().trim().max(16, "Locale is invalid").optional().default(""),
  source: z.string().trim().max(60, "Source is invalid").optional().default("signup-page"),
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
  const parsed = signupBodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request body" }, { status: 400 })
  }

  const email = normalizeSignupEmail(parsed.data.email)
  if (!SIGNUP_EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 })
  }

  let headers: Record<string, string> = {}
  try {
    const rateLimit = await checkRateLimit("authSignup", `auth-signup:${ipAddress}::${email}`)
    headers = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return NextResponse.json(
        { success: false, error: "Too many signup attempts. Please try again shortly." },
        { status: 429, headers },
      )
    }
  } catch (error) {
    if (isRateLimitUnavailableError(error)) {
      return NextResponse.json(
        { success: false, error: "Signup is temporarily unavailable. Please try again shortly." },
        { status: 503 },
      )
    }
    throw error
  }

  try {
    const result = await createOrRefreshSignupRequest({
      name: parsed.data.name,
      email,
      password: parsed.data.password,
      estateName: parsed.data.estateName,
      country: parsed.data.country || null,
      preferredLocale: parsed.data.preferredLocale || null,
      source: parsed.data.source || "signup-page",
      ipAddress,
      userAgent,
    })

    return NextResponse.json(
      {
        success: true,
        email: result.email,
        maskedEmail: result.maskedEmail,
        signupRequestId: result.signupRequestId,
        verificationSent: result.verificationSent,
      },
      { headers },
    )
  } catch (error) {
    const normalizedError = normalizeOnboardingError(error)
    const message = normalizedError.message || "Failed to create signup request"
    const status =
      message === "An account already exists for this email"
        ? 409
        : message.includes("Unable to send verification email")
          ? 502
          : 400

    return NextResponse.json({ success: false, error: message }, { status, headers })
  }
}
