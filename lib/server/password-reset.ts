import "server-only"

import { hashPassword } from "@/lib/passwords"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
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

  const passwordHash = hashPassword(input.newPassword)

  /**
   * CONSUMING THE LINK, CHANGING THE PASSWORD AND KILLING THE SIBLINGS ARE ONE STEP.
   *
   * These were three separate statements in three separate transactions, which CodeRabbit raised
   * twice on PR #39. Both findings are the same structural fact seen from different sides.
   *
   * 1. A SWEEP FAILURE REPORTED A COMPLETED PASSWORD CHANGE AS A FAILED RESET. (Major)
   *
   *    If the sibling sweep threw, the password had already committed and the presented token had
   *    already been consumed -- but the function rejected, so the route told the user the reset
   *    failed and never logged auth_password_reset_completed. Their password HAD changed. Clicking
   *    the link again got "already used", so the only way forward was a fresh reset email for an
   *    account that was already recovered.
   *
   *    The old comment here argued the opposite: "a failure here cannot leave the account
   *    unrecoverable -- the reset has already succeeded by this point". That is true of the database
   *    and false of the person, and the person is who the function reports to.
   *
   * 2. CONCURRENT RESETS FOR THE SAME USER WERE NOT SERIALIZED. (Major, CWE-362)
   *
   *    Two outstanding tokens, two requests. Each statement ran in its own transaction, so the
   *    user-row write held no lock across the sweep. Both tokens could be consumed and the second
   *    call could set the password after the first had finished sweeping -- which defeats the exact
   *    guarantee the sweep exists to provide. Production has already issued one user two tokens on
   *    2026-08-04, so the precondition is real even if the timing is hard to hit.
   *
   * ONE TRANSACTION FIXES BOTH: the sweep can no longer fail independently of the change it
   * accompanies, and pg_advisory_xact_lock on the user id makes a second reset for the same user
   * wait rather than interleave. The lock is transaction-scoped, so it releases on commit; keying
   * it on the user id rather than the token is what makes two DIFFERENT tokens serialize.
   * Same primitive app/api/sales/route.ts uses to stop two racing sales overselling a slot.
   *
   * ⚠ runTenantQueries is NON-INTERACTIVE -- client.transaction([...]) sends every statement in one
   * request, so there is no branching in JS between them. The two conditions that used to be `if`
   * statements are therefore expressed in SQL, both keyed on `consumed_at = CURRENT_TIMESTAMP`.
   * CURRENT_TIMESTAMP is the transaction's start time and identical across all four statements, so
   * it means exactly "the row THIS transaction consumed" -- not "recently consumed by anyone".
   * Without that, a token consumed a second earlier by a racing request would satisfy the check.
   *
   * ⚠ Known and accepted: runTenantQueries retries transient CONNECTION errors. If the transaction
   * commits and the response is lost, the retry finds the token already consumed, changes nothing
   * (both EXISTS guards fail), and reports the link as used -- while the password did change. That
   * is finding 1 again, in a far narrower window, and closing it properly needs an idempotency key
   * rather than a lock. Not worth the schema change for a dropped-response-after-commit race.
   *
   * idx_password_reset_tokens_user_active (scripts/101) was built for the sweep's lookup.
   */
  const thisTransactionConsumedIt = sql`
    EXISTS (
      SELECT 1 FROM password_reset_tokens
      WHERE id = ${record.token_id}
        AND consumed_at = CURRENT_TIMESTAMP
    )
  `
  const [, consumedRows] = await runTenantQueries(sql, ownerContext, [
    sql`SELECT pg_advisory_xact_lock(hashtext(${`password-reset:${record.user_id}`}))`,
    sql`
      UPDATE password_reset_tokens
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE id = ${record.token_id}
        AND consumed_at IS NULL
      RETURNING id
    `,
    sql`
      UPDATE users
      SET password_hash = ${passwordHash},
          password_reset_required = FALSE,
          password_updated_at = CURRENT_TIMESTAMP
      WHERE id = ${record.user_id}
        AND ${thisTransactionConsumedIt}
    `,
    /**
     * EVERY OTHER OUTSTANDING LINK DIES WITH THIS ONE.
     *
     * Only the token just used was being consumed, so somebody who clicked "forgot password" twice
     * left the first link live for its full hour after recovering the account with the second. Each
     * unused link is a standing account-takeover credential sitting in an inbox, and the window did
     * not close when the account was recovered -- it closed on a timer.
     *
     * Gated on the same condition as the password update. A sweep that ran when this reset had NOT
     * consumed its token would burn every link the user holds on behalf of a request that failed,
     * locking them out of their own recovery.
     */
    sql`
      UPDATE password_reset_tokens
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE user_id = ${record.user_id}
        AND consumed_at IS NULL
        AND ${thisTransactionConsumedIt}
    `,
  ])

  // Nothing above committed a password change if this is empty: both writes are gated on the same
  // EXISTS, so the transaction was a no-op rather than a partial reset.
  if (!consumedRows.length) {
    throw new Error(RESET_LINK_USED_MESSAGE)
  }

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
