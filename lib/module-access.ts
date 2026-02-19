import "server-only"

import { cookies } from "next/headers"
import { sql } from "@/lib/server/db"
import { MODULE_IDS, resolveEnabledModules } from "@/lib/modules"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireSessionUser, type SessionUser } from "@/lib/server/auth"

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

  if (user.role === "owner") {
    return MODULE_IDS
  }

  if (!sql) {
    throw new Error("Database not configured")
  }

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
  const tenantEnabled = tenantModules?.length ? resolveEnabledModules(tenantModules) : resolveEnabledModules()

  if (user.role === "admin") {
    return tenantEnabled
  }

  if (userId) {
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
        return filterUserBlockedModules(
          tenantEnabled.filter((moduleId) => (userMap.has(moduleId) ? Boolean(userMap.get(moduleId)) : true)),
        )
      }
    } catch (error) {
      if (!isMissingRelation(error, "user_modules")) {
        throw error
      }
    }
  }

  return filterUserBlockedModules(tenantEnabled)
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
