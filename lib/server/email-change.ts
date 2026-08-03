import "server-only"

import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logSecurityEvent } from "@/lib/server/security-events"
import { isEmailIdentifier, normalizeSignupEmail } from "@/lib/server/onboarding/utils"
import { sendEmailChangeNotice, sendEmailChangeVerification } from "@/lib/server/email-change-email"
import {
  EMAIL_CHANGE_LINK_INVALID_MESSAGE,
  EMAIL_CHANGE_LINK_USED_MESSAGE,
  EMAIL_CHANGE_SAME_MESSAGE,
  EMAIL_CHANGE_TAKEN_MESSAGE,
  generateEmailChangeToken,
  getEmailChangeStateError,
  hashEmailChangeToken,
  isDuplicateEmailError,
  resolveEmailChangeExpiry,
} from "@/lib/server/email-change-utils"

// Cross-tenant by necessity: the uniqueness rule on users.normalized_email is GLOBAL (see
// idx_users_normalized_email_unique), so "is this address free?" cannot be answered from inside
// one tenant. Same reason password-reset.ts resolves accounts this way.
const ownerContext = normalizeTenantContext(undefined, "owner")

export class EmailChangeError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = "EmailChangeError"
    this.status = status
  }
}

export async function requestEmailChange(input: {
  userId: string
  tenantId: string
  username: string
  currentEmail: string | null
  newEmail: string
  ipAddress: string
  userAgent: string | null
}): Promise<{ maskedSentTo: string }> {
  const newEmail = String(input.newEmail || "").trim()
  if (!isEmailIdentifier(newEmail)) {
    throw new EmailChangeError("Enter a valid email address")
  }

  const normalizedNew = normalizeSignupEmail(newEmail)
  if (normalizedNew === normalizeSignupEmail(input.currentEmail || "")) {
    throw new EmailChangeError(EMAIL_CHANGE_SAME_MESSAGE)
  }

  // Early, friendly rejection. Not authoritative — the address can be claimed during the hour
  // the link is valid — so confirmEmailChange re-checks and the unique index is the real
  // guarantee behind both.
  const taken = await runTenantQuery(
    sql,
    ownerContext,
    sql`SELECT id FROM users WHERE normalized_email = ${normalizedNew} LIMIT 1`,
  )
  if (taken.length) {
    throw new EmailChangeError(EMAIL_CHANGE_TAKEN_MESSAGE, 409)
  }

  // Any link already in flight for this user is void. Without this, a user who mistypes an
  // address and immediately retries leaves a live token pointing at the typo'd inbox.
  await runTenantQuery(
    sql,
    ownerContext,
    sql`
      UPDATE email_change_tokens
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE user_id = ${input.userId}
        AND consumed_at IS NULL
    `,
  )

  const token = generateEmailChangeToken()
  await runTenantQuery(
    sql,
    ownerContext,
    sql`
      INSERT INTO email_change_tokens (user_id, new_email, normalized_new_email, token_hash, expires_at, requested_ip)
      VALUES (
        ${input.userId}, ${newEmail}, ${normalizedNew},
        ${hashEmailChangeToken(token)}, ${resolveEmailChangeExpiry().toISOString()}, ${input.ipAddress}
      )
    `,
  )

  await sendEmailChangeVerification({ newEmail, username: input.username, token })

  // Best-effort: a legacy account with no email on file has nowhere to warn, and a delivery
  // failure here must not roll back a change the user legitimately asked for.
  if (input.currentEmail) {
    await sendEmailChangeNotice({
      oldEmail: input.currentEmail,
      newEmail,
      username: input.username,
    }).catch(() => undefined)
  }

  await logSecurityEvent({
    tenantId: input.tenantId,
    actorUserId: input.userId,
    actorUsername: input.username,
    eventType: "auth_email_change_requested",
    severity: "warning",
    source: "account/email",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: { normalizedNewEmail: normalizedNew },
  })

  return { maskedSentTo: newEmail }
}

export async function confirmEmailChange(input: {
  token: string
  ipAddress: string
  userAgent: string | null
}): Promise<{ username: string; newEmail: string }> {
  const token = String(input.token || "").trim()
  if (!token) {
    throw new EmailChangeError(EMAIL_CHANGE_LINK_INVALID_MESSAGE)
  }

  const rows = (await runTenantQuery(
    sql,
    ownerContext,
    sql`
      SELECT
        ect.id AS token_id,
        ect.consumed_at,
        ect.expires_at,
        ect.new_email,
        ect.normalized_new_email,
        u.id AS user_id,
        u.tenant_id,
        u.username
      FROM email_change_tokens ect
      JOIN users u ON u.id = ect.user_id
      WHERE ect.token_hash = ${hashEmailChangeToken(token)}
      LIMIT 1
    `,
  )) as Array<{
    token_id: string
    consumed_at: string | null
    expires_at: string
    new_email: string
    normalized_new_email: string
    user_id: string
    tenant_id: string
    username: string
  }>

  const record = rows[0]
  if (!record) {
    throw new EmailChangeError(EMAIL_CHANGE_LINK_INVALID_MESSAGE)
  }

  const stateError = getEmailChangeStateError({ consumedAt: record.consumed_at, expiresAt: record.expires_at })
  if (stateError) {
    throw new EmailChangeError(stateError)
  }

  // Consume first, and only if still unconsumed. Two clicks on the same link race here, and the
  // WHERE clause is what makes exactly one of them win — same pattern as resetPasswordWithToken.
  const consumed = await runTenantQuery(
    sql,
    ownerContext,
    sql`
      UPDATE email_change_tokens
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE id = ${record.token_id}
        AND consumed_at IS NULL
      RETURNING id
    `,
  )
  if (!consumed.length) {
    throw new EmailChangeError(EMAIL_CHANGE_LINK_USED_MESSAGE)
  }

  // All three columns move together. email alone would break password reset (which looks up
  // normalized_email); leaving email_verified_at untouched would assert that a verification
  // performed against the OLD address vouches for the new one.
  try {
    await runTenantQuery(
      sql,
      ownerContext,
      sql`
        UPDATE users
        SET email = ${record.new_email},
            normalized_email = ${record.normalized_new_email},
            email_verified_at = CURRENT_TIMESTAMP
        WHERE id = ${record.user_id}
      `,
    )
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      throw new EmailChangeError(EMAIL_CHANGE_TAKEN_MESSAGE, 409)
    }
    throw error
  }

  await logSecurityEvent({
    tenantId: record.tenant_id,
    actorUserId: record.user_id,
    actorUsername: record.username,
    eventType: "auth_email_change_completed",
    severity: "warning",
    source: "auth/confirm-email-change",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: { normalizedNewEmail: record.normalized_new_email },
  })

  return { username: record.username, newEmail: record.new_email }
}
