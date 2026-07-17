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

  const cacheKey = `${user.tenantId}:${user.id}`
  const cached = getCachedModules(cacheKey)
  if (cached) return cached

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

  if (user.role === "admin") {
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
