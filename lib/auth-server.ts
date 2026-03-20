import "server-only"

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
}): SessionUser => ({
  id: String(input.id || ""),
  username: String(input.username || ""),
  role: normalizeRole(input.role),
  tenantId: String(input.tenantId || ""),
  sessionMode: input.sessionMode === "app" ? "app" : input.sessionMode === "web" ? "web" : undefined,
  passwordResetRequired: Boolean(input.passwordResetRequired),
  preferredLocale: normalizeAppLocale(input.preferredLocale || DEFAULT_APP_LOCALE),
  setupCompleted: Boolean(input.setupCompleted),
  requiresGuidedSetup: Boolean(input.requiresGuidedSetup),
})

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
