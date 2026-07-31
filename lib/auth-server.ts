import "server-only"

import * as Sentry from "@sentry/nextjs"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/i18n"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { normalizeUsernameLookup } from "@/lib/usernames"

const asErrorRecord = (error: unknown): Record<string, unknown> =>
  error && typeof error === "object" ? (error as Record<string, unknown>) : {}

const isMissingPasswordResetColumnError = (error: unknown) => {
  const errorRecord = asErrorRecord(error)
  const code = String(errorRecord.code || "")
  const message = String(errorRecord.message || "")
  return code === "42703" || message.includes('column "password_reset_required" does not exist')
}

const isMissingPreferredLocaleColumnError = (error: unknown) => {
  const errorRecord = asErrorRecord(error)
  const code = String(errorRecord.code || "")
  const message = String(errorRecord.message || "")
  return code === "42703" || message.includes('column "preferred_locale" does not exist')
}

const isMissingSetupCompletedColumnError = (error: unknown) => {
  const errorRecord = asErrorRecord(error)
  const code = String(errorRecord.code || "")
  const message = String(errorRecord.message || "")
  return code === "42703" || message.includes('column "setup_completed_at" does not exist')
}

const isMissingRequiresGuidedSetupColumnError = (error: unknown) => {
  const errorRecord = asErrorRecord(error)
  const code = String(errorRecord.code || "")
  const message = String(errorRecord.message || "")
  return code === "42703" || message.includes('column "requires_guided_setup" does not exist')
}

export type SessionUser = {
  id: string
  username: string
  role: "admin" | "user" | "owner"
  tenantId: string
  sessionMode?: "app" | "web"
  passwordResetRequired?: boolean
  preferredLocale?: string
  setupCompleted?: boolean
  requiresGuidedSetup?: boolean
}

const normalizeRole = (value: unknown): SessionUser["role"] => {
  const role = String(value || "").toLowerCase()
  if (role === "owner" || role === "admin" || role === "user") return role
  return "user"
}

const toSessionUser = (input: {
  id: unknown
  username: unknown
  role: unknown
  tenantId: unknown
  sessionMode?: unknown
  passwordResetRequired?: unknown
  preferredLocale?: unknown
  setupCompleted?: unknown
  requiresGuidedSetup?: unknown
}): SessionUser => {
  const sessionUser: SessionUser = {
    id: String(input.id || ""),
    username: String(input.username || ""),
    role: normalizeRole(input.role),
    tenantId: String(input.tenantId || ""),
    sessionMode: input.sessionMode === "app" ? "app" : input.sessionMode === "web" ? "web" : undefined,
    passwordResetRequired: Boolean(input.passwordResetRequired),
    preferredLocale: normalizeAppLocale(input.preferredLocale || DEFAULT_APP_LOCALE),
    setupCompleted: Boolean(input.setupCompleted),
    requiresGuidedSetup: Boolean(input.requiresGuidedSetup),
  }

  // Tag the request's Sentry scope with who it belongs to. This is the one place every
  // resolution path funnels through, so tagging here covers all of them. Without it a
  // server issue gives no clue which estate is affected — the difference between one
  // tenant's bad data and an outage for everyone. No email or personal detail is attached.
  try {
    Sentry.setUser({ id: sessionUser.id, username: sessionUser.username })
    Sentry.setTag("tenant_id", sessionUser.tenantId || "global")
    Sentry.setTag("user_role", sessionUser.role)
  } catch {
    // Observability must never be able to fail a request.
  }

  return sessionUser
}

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions)
  const user = session?.user

  type UserLookupRow = {
    id: string
    username: string
    role: SessionUser["role"]
    tenant_id: string
    password_reset_required: boolean
    preferred_locale: string | null
    setup_completed_at: string | null
    requires_guided_setup: boolean
  }

  const ownerContext = normalizeTenantContext(undefined, "owner")

  if (user?.id && sql) {
    let rows: UserLookupRow[] = []
    try {
      rows = (await runTenantQuery(
        sql,
        ownerContext,
        sql`
          SELECT id, username, role, tenant_id, password_reset_required
            , preferred_locale, setup_completed_at, requires_guided_setup
          FROM users
          WHERE id = ${String(user.id)}
          LIMIT 1
        `,
      )) as UserLookupRow[]
    } catch (error) {
      if (
        !isMissingPasswordResetColumnError(error) &&
        !isMissingPreferredLocaleColumnError(error) &&
        !isMissingSetupCompletedColumnError(error) &&
        !isMissingRequiresGuidedSetupColumnError(error)
      ) {
        throw error
      }
      const fallbackRows = (await runTenantQuery(
        sql,
        ownerContext,
        sql`
          SELECT id, username, role, tenant_id
          FROM users
          WHERE id = ${String(user.id)}
          LIMIT 1
        `,
      )) as Array<Omit<UserLookupRow, "password_reset_required" | "preferred_locale" | "setup_completed_at" | "requires_guided_setup">>
      rows = fallbackRows.map((row) => ({
        ...row,
        password_reset_required: false,
        preferred_locale: DEFAULT_APP_LOCALE,
        setup_completed_at: null,
        requires_guided_setup: false,
      }))
    }

    if (rows.length) {
      return toSessionUser({
        id: rows[0].id,
        username: rows[0].username || user.name || "",
        role: rows[0].role,
        tenantId: rows[0].tenant_id,
        sessionMode: user.sessionMode,
        passwordResetRequired: rows[0].password_reset_required,
        preferredLocale: rows[0].preferred_locale,
        setupCompleted: Boolean(rows[0].setup_completed_at),
        requiresGuidedSetup: Boolean(rows[0].requires_guided_setup),
      })
    }
  }

  if (user?.id && user?.tenantId && user?.role) {
    return toSessionUser({
      id: user.id,
      username: user.name || "",
      role: user.role,
      tenantId: user.tenantId,
      sessionMode: user.sessionMode,
      passwordResetRequired: user.passwordResetRequired,
      preferredLocale: user.preferredLocale,
      setupCompleted: user.setupCompleted,
      requiresGuidedSetup: user.requiresGuidedSetup,
    })
  }

  if (user?.name && sql) {
    const normalizedUsername = normalizeUsernameLookup(user.name)
    let rows: UserLookupRow[] = []
    try {
      rows = await runTenantQuery(
        sql,
        ownerContext,
        sql`
          SELECT id, username, role, tenant_id, password_reset_required
            , preferred_locale, setup_completed_at, requires_guided_setup
          FROM users
          WHERE LOWER(BTRIM(username)) = ${normalizedUsername}
          ORDER BY
            CASE WHEN BTRIM(username) = ${String(user.name)} THEN 0 ELSE 1 END,
            created_at ASC
          LIMIT 1
        `,
      ) as UserLookupRow[]
    } catch (error) {
      if (
        !isMissingPasswordResetColumnError(error) &&
        !isMissingPreferredLocaleColumnError(error) &&
        !isMissingSetupCompletedColumnError(error) &&
        !isMissingRequiresGuidedSetupColumnError(error)
      ) {
        throw error
      }
      const fallbackRows = (await runTenantQuery(
        sql,
        ownerContext,
        sql`
          SELECT id, username, role, tenant_id
          FROM users
          WHERE LOWER(BTRIM(username)) = ${normalizedUsername}
          ORDER BY
            CASE WHEN BTRIM(username) = ${String(user.name)} THEN 0 ELSE 1 END,
            created_at ASC
          LIMIT 1
        `,
      )) as Array<Omit<UserLookupRow, "password_reset_required" | "preferred_locale" | "setup_completed_at" | "requires_guided_setup">>
      rows = fallbackRows.map((row) => ({
        ...row,
        password_reset_required: false,
        preferred_locale: DEFAULT_APP_LOCALE,
        setup_completed_at: null,
        requires_guided_setup: false,
      }))
    }
    if (rows.length) {
      return toSessionUser({
        id: rows[0].id,
        username: rows[0].username || user.name || "",
        role: rows[0].role,
        tenantId: rows[0].tenant_id,
        sessionMode: user.sessionMode,
        passwordResetRequired: rows[0].password_reset_required,
        preferredLocale: rows[0].preferred_locale,
        setupCompleted: Boolean(rows[0].setup_completed_at),
        requiresGuidedSetup: Boolean(rows[0].requires_guided_setup),
      })
    }
  }

  throw new Error("Unauthorized")
}
