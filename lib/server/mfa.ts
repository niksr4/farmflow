import "server-only"

import { authenticator } from "otplib"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireSessionUser, type SessionUser } from "@/lib/server/auth"
import { logSecurityEvent } from "@/lib/server/security-events"

const ensureSql = () => {
  if (!sql) {
    throw new Error("Database not configured")
  }
  return sql
}

export async function getMfaStatus(sessionUser: SessionUser) {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const rows = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT mfa_enabled, mfa_enrolled_at
      FROM users
      WHERE username = ${sessionUser.username}
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  return {
    enabled: Boolean(rows?.[0]?.mfa_enabled),
    enrolledAt: rows?.[0]?.mfa_enrolled_at ? new Date(rows[0].mfa_enrolled_at).toISOString() : null,
  }
}

export async function setupMfa(sessionUser: SessionUser) {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const secret = authenticator.generateSecret()
  const label = `FarmFlow (${sessionUser.username})`
  const issuer = "FarmFlow"
  const otpauth = authenticator.keyuri(sessionUser.username, issuer, secret)

  await runTenantQuery(
    db,
    tenantContext,
    db`
      UPDATE users
      SET mfa_secret = ${secret},
          mfa_enabled = FALSE,
          mfa_enrolled_at = NULL
      WHERE username = ${sessionUser.username}
        AND tenant_id = ${tenantContext.tenantId}
    `,
  )

  await logSecurityEvent({
    tenantId: tenantContext.tenantId,
    actorUsername: sessionUser.username,
    actorRole: sessionUser.role,
    eventType: "mfa_setup_started",
    severity: "info",
    source: "mfa",
  })

  return { secret, otpauth, label }
}

export async function verifyAndEnableMfa(sessionUser: SessionUser, token: string) {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const rows = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT mfa_secret
      FROM users
      WHERE username = ${sessionUser.username}
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  const secret = String(rows?.[0]?.mfa_secret || "")
  if (!secret) {
    throw new Error("MFA secret not initialized")
  }
  const isValid = authenticator.check(token, secret)
  if (!isValid) {
    throw new Error("Invalid MFA code")
  }

  await runTenantQuery(
    db,
    tenantContext,
    db`
      UPDATE users
      SET mfa_enabled = TRUE,
          mfa_enrolled_at = NOW(),
          mfa_last_verified_at = NOW()
      WHERE username = ${sessionUser.username}
        AND tenant_id = ${tenantContext.tenantId}
    `,
  )

  await logSecurityEvent({
    tenantId: tenantContext.tenantId,
    actorUsername: sessionUser.username,
    actorRole: sessionUser.role,
    eventType: "mfa_enabled",
    severity: "warning",
    source: "mfa",
  })
}

export async function disableMfa(sessionUser: SessionUser, token: string) {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const rows = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT mfa_secret
      FROM users
      WHERE username = ${sessionUser.username}
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  const secret = String(rows?.[0]?.mfa_secret || "")
  if (!secret) {
    throw new Error("MFA not configured")
  }
  const isValid = authenticator.check(token, secret)
  if (!isValid) {
    throw new Error("Invalid MFA code")
  }

  await runTenantQuery(
    db,
    tenantContext,
    db`
      UPDATE users
      SET mfa_enabled = FALSE,
          mfa_secret = NULL,
          mfa_enrolled_at = NULL,
          mfa_last_verified_at = NULL,
          mfa_recovery_codes = NULL
      WHERE username = ${sessionUser.username}
        AND tenant_id = ${tenantContext.tenantId}
    `,
  )

  await logSecurityEvent({
    tenantId: tenantContext.tenantId,
    actorUsername: sessionUser.username,
    actorRole: sessionUser.role,
    eventType: "mfa_disabled",
    severity: "warning",
    source: "mfa",
  })
}

export async function requireAdminSession() {
  const sessionUser = await requireSessionUser()
  if (!["owner", "admin"].includes(sessionUser.role)) {
    throw new Error("Admin role required")
  }
  if (sessionUser.mfaEnabled && !sessionUser.mfaVerified) {
    throw new Error("MFA required")
  }
  return sessionUser
}
