import "server-only"

import { hashPassword } from "@/lib/passwords"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logSecurityEvent } from "@/lib/server/security-events"
import { isEmailIdentifier, normalizeSignupEmail } from "@/lib/server/onboarding/utils"
import { normalizeUsernameLookup } from "@/lib/usernames"
import { sendPasswordResetEmail } from "@/lib/server/password-reset-email"
import {
  generatePasswordResetToken,
  getPasswordResetStateError,
  hashPasswordResetToken,
  resolvePasswordResetExpiry,
  RESET_LINK_INVALID_MESSAGE,
  RESET_LINK_USED_MESSAGE,
} from "@/lib/server/password-reset-utils"

const ownerContext = normalizeTenantContext(undefined, "owner")

type UserLookupRow = {
  id: string
  username: string
  tenant_id: string
  email: string | null
}

const findUserByIdentifier = async (identifier: string): Promise<UserLookupRow | null> => {
  const trimmed = String(identifier || "").trim()
  if (!trimmed) return null

  if (isEmailIdentifier(trimmed)) {
    const normalizedEmail = normalizeSignupEmail(trimmed)
    const rows = (await runTenantQuery(
      sql,
      ownerContext,
      sql`
        SELECT id, username, tenant_id, email
        FROM users
        WHERE normalized_email = ${normalizedEmail}
        LIMIT 1
      `,
    )) as UserLookupRow[]
    return rows[0] || null
  }

  const normalizedUsername = normalizeUsernameLookup(trimmed)
  const rows = (await runTenantQuery(
    sql,
    ownerContext,
    sql`
      SELECT id, username, tenant_id, email
      FROM users
      WHERE LOWER(BTRIM(username)) = ${normalizedUsername}
      LIMIT 1
    `,
  )) as UserLookupRow[]
  return rows[0] || null
}

export async function requestPasswordReset(input: {
  identifier: string
  ipAddress: string
  userAgent: string | null
}): Promise<void> {
  const user = await findUserByIdentifier(input.identifier)

  if (!user) {
    // Deliberately no distinguishing response — callers always see the same generic
    // success message so this endpoint can't be used to enumerate registered accounts.
    await logSecurityEvent({
      eventType: "auth_password_reset_requested_unknown",
      severity: "info",
      source: "auth/forgot-password",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    })
    return
  }

  if (!user.email) {
    // Account has no email on file (legacy username-only accounts) — nowhere to send the link.
    await logSecurityEvent({
      tenantId: user.tenant_id,
      actorUserId: user.id,
      actorUsername: user.username,
      eventType: "auth_password_reset_requested_no_email",
      severity: "info",
      source: "auth/forgot-password",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    })
    return
  }

  const token = generatePasswordResetToken()
  const tokenHash = hashPasswordResetToken(token)
  const expiresAt = resolvePasswordResetExpiry()

  await runTenantQuery(
    sql,
    ownerContext,
    sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
      VALUES (${user.id}, ${tokenHash}, ${expiresAt.toISOString()}, ${input.ipAddress})
    `,
  )

  await sendPasswordResetEmail({ email: user.email, username: user.username, token })

  await logSecurityEvent({
    tenantId: user.tenant_id,
    actorUserId: user.id,
    actorUsername: user.username,
    eventType: "auth_password_reset_requested",
    severity: "warning",
    source: "auth/forgot-password",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  })
}

type ConsumeResult = {
  username: string
}

export async function resetPasswordWithToken(input: {
  token: string
  newPassword: string
  ipAddress: string
  userAgent: string | null
}): Promise<ConsumeResult> {
  const token = String(input.token || "").trim()
  if (!token) {
    throw new Error("Reset token is required")
  }

  const tokenHash = hashPasswordResetToken(token)
  const lookupRows = (await runTenantQuery(
    sql,
    ownerContext,
    sql`
      SELECT
        prt.id AS token_id,
        prt.consumed_at,
        prt.expires_at,
        u.id AS user_id,
        u.tenant_id,
        u.username
      FROM password_reset_tokens prt
      JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = ${tokenHash}
      LIMIT 1
    `,
  )) as Array<{
    token_id: string
    consumed_at: string | null
    expires_at: string
    user_id: string
    tenant_id: string
    username: string
  }>

  const record = lookupRows[0]
  if (!record) {
    throw new Error(RESET_LINK_INVALID_MESSAGE)
  }

  const stateError = getPasswordResetStateError({ consumedAt: record.consumed_at, expiresAt: record.expires_at })
  if (stateError) {
    throw new Error(stateError)
  }

  const consumedRows = await runTenantQuery(
    sql,
    ownerContext,
    sql`
      UPDATE password_reset_tokens
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE id = ${record.token_id}
        AND consumed_at IS NULL
      RETURNING id
    `,
  )
  if (!consumedRows.length) {
    throw new Error(RESET_LINK_USED_MESSAGE)
  }

  const passwordHash = hashPassword(input.newPassword)
  await runTenantQuery(
    sql,
    ownerContext,
    sql`
      UPDATE users
      SET password_hash = ${passwordHash},
          password_reset_required = FALSE,
          password_updated_at = CURRENT_TIMESTAMP
      WHERE id = ${record.user_id}
    `,
  )

  await logSecurityEvent({
    tenantId: record.tenant_id,
    actorUserId: record.user_id,
    actorUsername: record.username,
    eventType: "auth_password_reset_completed",
    severity: "warning",
    source: "auth/reset-password",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  })

  return { username: record.username }
}
