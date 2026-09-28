import "server-only"

import * as Sentry from "@sentry/nextjs"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/i18n"
import { isDbConfigured, sql } from "@/lib/server/db"
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

  if (user?.id && isDbConfigured) {
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

    /**
     * THE DATABASE WAS ASKED AND SAID THIS USER DOES NOT EXIST. That is an answer, not a
     * gap, so it ends the request.
     *
     * This used to fall through to the JWT-claims branch below, which handed back the
     * `role` and `tenantId` baked into the cookie at login. Sessions here are 30 days
     * (a deliberate decision — estate managers use personal devices), so deleting a user
     * or moving them between tenants left a token that kept working, with its old
     * permissions, for up to a month. Revoking access did not revoke access.
     *
     * That is the shared root cause behind four separate fixes: #32 and #35 made the
     * location and module resolvers fail closed instead of open, and #42 and #47 closed
     * the cache and identity holes those two still had. Each was a downstream defence
     * against a principal that no longer exists. This is the upstream cause.
     *
     * It deliberately does NOT fall through to the username lookup either. A username can
     * be reused, so resolving a stale id by name risks handing the session to a DIFFERENT
     * account that has since taken that name — a worse outcome than the stale claims. The
     * username path exists for legacy tokens carrying no id at all, and is reached below.
     *
     * Verified before changing: under the exact runtime path (app_runtime role, RLS
     * enforced, the same three GUCs runTenantQuery sets) every real user resolves by id --
     * 11/11 on prod and 10/10 on dev, across 6 tenants, with the owner among them. The
     * `users` RLS policy grants `app.role = 'owner'` a full bypass (script 98) and
     * ownerContext sets exactly that, so this lookup is not tenant-scoped and cannot
     * silently return zero rows for a legitimate user in another tenant.
     */
    throw new Error("Unauthorized")
  }

  /**
   * NO DATABASE TO ASK. Distinct from the case above: nothing has told us the user is gone,
   * we simply cannot check. Routes gate on `isDbConfigured` and return
   * databaseNotConfiguredResponse() well before this matters, so this keeps a DB-less local
   * boot working rather than failing.
   *
   * GATED ON `isDbConfigured`, NOT ON `sql` BEING FALSY -- `sql` is never falsy.
   * lib/server/db.ts line 80 is `baseUrl ? neon(baseUrl) : createUnavailableClient()`, so an
   * unconfigured database yields a stub that THROWS on use rather than an absent client.
   * Testing `sql` as a boolean therefore reads as "configured" always: the three guards here
   * would enter their lookups, the stub would throw "Database not configured", and since that
   * is not one of the missing-column errors the catch re-raises it. A DB-less boot got a driver
   * error instead of a session, and this branch could never be reached at all.
   */
  if (!isDbConfigured && user?.id && user?.tenantId && user?.role) {
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

  if (user?.name && isDbConfigured) {
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
