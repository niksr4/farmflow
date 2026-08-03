import { NextResponse } from "next/server"
import { z } from "zod"

import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { verifyPassword } from "@/lib/passwords"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { extractClientIp } from "@/lib/server/request-security"
import { checkRateLimit, isRateLimitUnavailableError } from "@/lib/rate-limit"
import { logSecurityEvent } from "@/lib/server/security-events"
import { logServerError } from "@/lib/server/safe-logging"
import { EmailChangeError, requestEmailChange } from "@/lib/server/email-change"
import { maskEmailAddress } from "@/lib/server/onboarding/utils"

// Deliberately no role gate. Every account holder can change their own address — a writer
// (role=user) has no settings surface at /settings, so this route and its page are reachable
// on their own, exactly like /settings/reset-password already is.
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  newEmail: z.string().trim().min(1, "New email is required"),
  currentPassword: z.string().min(1, "Current password is required"),
})

export async function POST(request: Request) {
  const ipAddress = extractClientIp(request.headers) || "unknown"
  const userAgent = request.headers.get("user-agent")

  try {
    const sessionUser = await requireSessionUser()

    // Shares the password-change bucket: both are account-takeover-adjacent, and this endpoint
    // is a password oracle if left unmetered (it reveals whether a guess was correct).
    const rateLimit = await checkRateLimit("accountPasswordChange", sessionUser.id)
    if (!rateLimit.success) {
      return NextResponse.json({ success: false, error: "Too many attempts. Try again shortly." }, { status: 429 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid request body" },
        { status: 400 },
      )
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, username, email, password_hash
        FROM users
        WHERE id = ${sessionUser.id}
          AND tenant_id = ${sessionUser.tenantId}
        LIMIT 1
      `,
    )

    const account = rows?.[0] as { id: string; username: string; email: string | null; password_hash: string } | undefined
    if (!account) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    // The whole point of asking for it: a stolen session must not be enough to move where
    // future password-reset links are delivered.
    if (!verifyPassword(parsed.data.currentPassword, String(account.password_hash || "")).matches) {
      await logSecurityEvent({
        tenantId: sessionUser.tenantId,
        actorUserId: sessionUser.id,
        actorUsername: account.username,
        eventType: "auth_email_change_bad_password",
        severity: "warning",
        source: "account/email",
        ipAddress,
        userAgent,
      }).catch(() => undefined)
      return NextResponse.json({ success: false, error: "Current password is incorrect" }, { status: 401 })
    }

    const result = await requestEmailChange({
      userId: account.id,
      tenantId: sessionUser.tenantId,
      username: account.username,
      currentEmail: account.email,
      newEmail: parsed.data.newEmail,
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      message: `Confirmation link sent to ${maskEmailAddress(result.maskedSentTo)}. Your current email stays active until you confirm.`,
    })
  } catch (error) {
    if (error instanceof EmailChangeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    if (isRateLimitUnavailableError(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 })
    }
    logServerError("Email change request failed", error)
    return NextResponse.json({ success: false, error: "Could not start the email change" }, { status: 500 })
  }
}
