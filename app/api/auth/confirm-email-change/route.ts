import { NextResponse } from "next/server"

import { extractClientIp } from "@/lib/server/request-security"
import { checkRateLimit, isRateLimitUnavailableError } from "@/lib/rate-limit"
import { logServerError } from "@/lib/server/safe-logging"
import { EmailChangeError, confirmEmailChange } from "@/lib/server/email-change"

/**
 * Lives under /api/auth (a PUBLIC_API_PREFIXES entry) rather than /api/account on purpose.
 *
 * The confirmation link is opened from the NEW mailbox, which is frequently a different device
 * or browser with no FarmFlow session — the same situation /api/auth/verify-email and
 * /api/auth/reset-password already handle. Requiring a session here would strand anyone who
 * checks mail on their phone.
 *
 * That is safe because the change was already authorised twice: once by the current password at
 * request time, and again by possession of a single-use token delivered only to the new address.
 */
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const ipAddress = extractClientIp(request.headers) || "unknown"

  try {
    // Public and token-guessing-adjacent, so metered by IP. Reuses the signup-verify bucket,
    // which is the same shape of operation: redeem a one-time emailed token.
    const rateLimit = await checkRateLimit("authSignupVerify", ipAddress)
    if (!rateLimit.success) {
      return NextResponse.json({ success: false, error: "Too many attempts. Try again shortly." }, { status: 429 })
    }

    const body = (await request.json().catch(() => ({}))) as { token?: string }
    const result = await confirmEmailChange({
      token: String(body.token || ""),
      ipAddress,
      userAgent: request.headers.get("user-agent"),
    })

    return NextResponse.json({
      success: true,
      username: result.username,
      message: "Email address updated. Use it to sign in from now on.",
    })
  } catch (error) {
    if (error instanceof EmailChangeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    if (isRateLimitUnavailableError(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 })
    }
    logServerError("Email change confirmation failed", error)
    return NextResponse.json({ success: false, error: "Could not confirm the email change" }, { status: 500 })
  }
}
