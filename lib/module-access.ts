import "server-only"

import { cookies } from "next/headers"
import { sql } from "@/lib/server/db"
import { MODULE_IDS, resolveTenantEnabledModules } from "@/lib/modules"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { resolveTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { requireSessionUser, type SessionUser } from "@/lib/server/auth"

// In-process cache for module lists. Warm serverless instances reuse this, eliminating 3 DB
// queries per API request. invalidateModuleCache() only clears the instance that handled the
// admin toggle, so the TTL bounds how long OTHER warm instances can serve stale access. Kept
// short (30s) so a module enable/disable takes effect everywhere within seconds instead of
// minutes; still absorbs the vast majority of per-request lookups. Tunable via env.
const MODULE_CACHE = new Map<string, { modules: string[]; expiresAt: number }>()
const CACHE_TTL_MS = Number(process.env.MODULE_CACHE_TTL_MS) || 30_000

function getCachedModules(key: string): string[] | null {
  const entry = MODULE_CACHE.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    MODULE_CACHE.delete(key)
    return null
  }
  return entry.modules
}

function setCachedModules(key: string, modules: string[]): void {
  MODULE_CACHE.set(key, { modules, expiresAt: Date.now() + CACHE_TTL_MS })
}

export function invalidateModuleCache(tenantId: string): void {
  for (const key of MODULE_CACHE.keys()) {
    if (key.startsWith(`${tenantId}:`)) {
      MODULE_CACHE.delete(key)
    }
  }
}

export class ModuleAccessError extends Error {
  constructor(message = "Module access disabled") {
    super(message)
    this.name = "ModuleAccessError"
  }
}

export const isModuleAccessError = (error: unknown) =>
  Boolean(error && (error as Error).name === "ModuleAccessError")

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const PREVIEW_TENANT_COOKIE = "farmflow_preview_tenant"
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const USER_ROLE_BLOCKED_MODULES = new Set<string>(["balance-sheet"])

const filterUserBlockedModules = (modules: string[]) =>
  modules.filter((moduleId) => !USER_ROLE_BLOCKED_MODULES.has(moduleId))

export async function resolveScopedSessionUser(user: SessionUser): Promise<SessionUser> {
  if (user.role !== "owner") return user

  const cookieStore = await cookies()
  const previewTenantId = String(cookieStore.get(PREVIEW_TENANT_COOKIE)?.value || "").trim()
  if (!previewTenantId || !UUID_PATTERN.test(previewTenantId)) {
    return user
  }

  if (!sql) return user

  try {
    const ownerContext = normalizeTenantContext(undefined, "owner")
    const tenantRows = await runTenantQuery(
      sql,
      ownerContext,
      sql`
        SELECT id
        FROM tenants
        WHERE id = ${previewTenantId}
        LIMIT 1
      `,
    )
    if (!tenantRows?.length) return user
    return { ...user, tenantId: previewTenantId }
  } catch {
    return user
  }
}

export async function getEnabledModules(sessionUser?: SessionUser): Promise<string[]> {
  const resolvedUser = sessionUser ?? (await requireSessionUser())
  const user = await resolveScopedSessionUser(resolvedUser)
  const ownerPreviewActive =
    resolvedUser.role === "owner" &&
    Boolean(user.tenantId) &&
    String(user.tenantId || "").trim() !== String(resolvedUser.tenantId || "").trim()

  if (user.role === "owner" && !ownerPreviewActive) {
    return MODULE_IDS
  }

  if (!sql) {
    throw new Error("Database not configured")
  }

  /**
   * ACCOUNT EXISTENCE IS CHECKED BEFORE ANY CACHED VALUE IS SERVED. The cache read sits BELOW the
   * `users` lookup, not above it.
   *
   * Same shape CodeRabbit found in lib/location-access.ts on PRs #32 and #47, swept here rather
   * than waiting for it to be reported twice. The `users` lookup below is the fail-closed check
   * that gives a deleted account nothing, and it was reachable only on a cache miss -- so for the
   * 30s TTL a deleted user's live session kept the module list computed while the account existed.
   * `DELETE /api/admin/users` does not invalidate MODULE_CACHE, and NextAuth JWTs are not revoked
   * server-side, which is what lets the session outlive the row.
   *
   * Milder than the location-access version, and worth being precise about rather than calling it
   * equivalent: a stale module list grants the tabs that account already had, where a stale
   * location `null` granted every location in the tenant. But "milder" is not "correct" -- it is
   * still an access decision served to a principal whose existence was never checked, which is
   * exactly the reasoning I got wrong on #47 and do not intend to repeat here.
   *
   * The cache still saves the tenant_modules, plan and user_modules reads -- three queries against
   * one indexed lookup.
   */
  const cacheKey = `${user.tenantId}:${user.id}`
  const tenantContext = normalizeTenantContext(user.tenantId, user.role)
  const userRows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id
      FROM users
      WHERE username = ${user.username}
        AND tenant_id = ${user.tenantId}
      LIMIT 1
    `,
  )
  const userId = userRows?.[0]?.id

  // A user-role session with no `users` row for its username+tenant gets NO modules (fail closed),
  // never the tenant-wide default. requireSessionUser() falls back to trusting the JWT's own claims
  // when its DB lookup finds no row (an account hard-deleted while a session was still live --
  // NextAuth JWTs are not revoked server-side), so falling through to `tenantEnabled` would hand
  // that stale session every module the tenant has, ignoring any per-user user_modules restrictions
  // the account had. Mirrors getAccessibleLocationIds() in lib/location-access.ts.
  //
  // ⚠ AN OWNER PREVIEW IS THE ONE CASE WHERE A MISSING `users` ROW IS NORMAL, NOT SUSPICIOUS.
  //
  // resolveScopedSessionUser swaps the tenant id and keeps the role, so a previewing owner arrives
  // here as role "owner" against somebody else's tenant -- a tenant they have no account in, and
  // should not need one in. Without this exemption the lookup above finds nothing, the fail-closed
  // branch fires, and the preview renders with no modules at all: no tabs, an empty workspace, and
  // nothing saying why. The access gate itself was never the problem (requireModuleAccess returns
  // early for role "owner"), so every API call behind the blank screen would have succeeded.
  //
  // Caught by CodeRabbit on PR #35, which is the PR that introduced the fail-closed branch.
  //
  // MOVED ABOVE the tenant_modules/plan reads so the cache check below can sit after it without
  // paying for three queries first. It never depended on them.
  if (user.role !== "admin" && !ownerPreviewActive && !userId) {
    setCachedModules(cacheKey, [])
    return []
  }

  // The account exists (or this is an owner preview, where it need not). NOW a cached answer is safe
  // to serve -- it saves the three reads below without standing in for the check above.
  const cached = getCachedModules(cacheKey)
  if (cached) return cached

  const tenantModules = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT module, enabled
      FROM tenant_modules
      WHERE tenant_id = ${user.tenantId}
    `,
  )
  const tenantPlanId = await resolveTenantPlanId({
    db: sql,
    tenantId: user.tenantId,
    role: user.role,
    moduleRows: tenantModules as Array<{ module: string; enabled: boolean }>,
  })
  const tenantEnabled = resolveTenantEnabledModules(
    tenantModules as Array<{ module: string; enabled: boolean }>,
    tenantPlanId,
    { allowPlanOverrides: true },
  )

  let result: string[]

  // A preview answers "what does this tenant's workspace look like", so it reads the tenant's
  // enabled modules exactly as that tenant's admin would -- unfiltered, like the admin branch.
  // Falling through to the generic branch below would apply filterUserBlockedModules and hide
  // balance-sheet, which is a role=user restriction (USER_ROLE_BLOCKED_MODULES) being applied to
  // an owner. The preview would then be wrong in the opposite direction: quieter, but still not
  // what the customer sees.
  if (user.role === "admin" || ownerPreviewActive) {
    result = tenantEnabled
  } else if (userId) {
    try {
      const userModules = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT module, enabled
          FROM user_modules
          WHERE user_id = ${userId}
        `,
      )
      if (userModules?.length) {
        const userMap = new Map(userModules.map((row: any) => [String(row.module), Boolean(row.enabled)]))
        result = filterUserBlockedModules(
          tenantEnabled.filter((moduleId) => (userMap.has(moduleId) ? Boolean(userMap.get(moduleId)) : true)),
        )
      } else {
        result = filterUserBlockedModules(tenantEnabled)
      }
    } catch (error) {
      if (!isMissingRelation(error, "user_modules")) {
        throw error
      }
      result = filterUserBlockedModules(tenantEnabled)
    }
  } else {
    // Unreachable for user-role sessions (the missing-userId case returned above); kept so
    // `result` is definitely assigned for any future role value.
    result = filterUserBlockedModules(tenantEnabled)
  }

  setCachedModules(cacheKey, result)
  return result
}

export async function requireModuleAccess(moduleId: string, sessionUser?: SessionUser): Promise<SessionUser> {
  const resolvedUser = sessionUser ?? (await requireSessionUser())
  const user = await resolveScopedSessionUser(resolvedUser)

  if (user.role === "owner") {
    return user
  }

  const enabled = await getEnabledModules(user)
  if (!enabled.includes(moduleId)) {
    throw new ModuleAccessError()
  }

  return user
}

export async function requireAnyModuleAccess(
  moduleIds: string[],
  sessionUser?: SessionUser,
): Promise<SessionUser> {
  const resolvedUser = sessionUser ?? (await requireSessionUser())
  const user = await resolveScopedSessionUser(resolvedUser)

  if (user.role === "owner") {
    return user
  }

  const enabled = await getEnabledModules(user)
  const allowed = moduleIds.some((moduleId) => enabled.includes(moduleId))
  if (!allowed) {
    throw new ModuleAccessError()
  }

  return user
}
