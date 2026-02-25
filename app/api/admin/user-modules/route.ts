import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAdminSession } from "@/lib/server/mfa"
import { MODULES, MODULE_IDS, resolveEnabledModules, resolveModuleStates } from "@/lib/modules"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logSecurityEvent } from "@/lib/server/security-events"

type ModuleState = { id: string; label: string; enabled: boolean }
const MODULE_LABEL_BY_ID = new Map(MODULES.map((module) => [module.id, module.label]))
const SCOPED_ROLE_DISABLED_MODULES = new Set(["balance-sheet"])

const applyUserRoleModulePolicy = (role: string, moduleId: string, enabled: boolean) =>
  role === "user" && SCOPED_ROLE_DISABLED_MODULES.has(moduleId) ? false : enabled

const adminErrorResponse = (error: any, fallback: string) => {
  const message = error?.message || fallback
  const status = ["MFA required", "Admin role required", "Unauthorized"].includes(message) ? 403 : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 })
    }

    const lookupContext = normalizeTenantContext(
      sessionUser.role === "owner" ? undefined : sessionUser.tenantId,
      sessionUser.role,
    )
    const [userRows, userModules, tenantModules] = await runTenantQueries(sql, lookupContext, [
      sql`
        SELECT id, tenant_id, role
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
      sql`
        SELECT module, enabled
        FROM user_modules
        WHERE user_id = ${userId}
      `,
      sql`
        SELECT module, enabled
        FROM tenant_modules
        WHERE tenant_id = (
          SELECT tenant_id FROM users WHERE id = ${userId} LIMIT 1
        )
      `,
    ])

    if (!userRows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const targetTenantId = String(userRows[0].tenant_id)
    const targetRole = String(userRows[0].role || "")
    if (sessionUser.role !== "owner" && targetTenantId !== sessionUser.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantEnabled = tenantModules?.length ? resolveEnabledModules(tenantModules) : resolveEnabledModules()
    const source = userModules?.length ? "user" : tenantModules?.length ? "tenant" : "default"
    const sourceRows = source === "user" ? userModules : source === "tenant" ? tenantModules : []
    const userMap =
      source === "user"
        ? new Map((userModules || []).map((row: any) => [String(row.module), Boolean(row.enabled)]))
        : null
    const modules: ModuleState[] = resolveModuleStates(sourceRows).map((module) => ({
      ...module,
      enabled: applyUserRoleModulePolicy(
        targetRole,
        module.id,
        tenantEnabled.includes(module.id) &&
          (userMap ? (userMap.has(module.id) ? Boolean(userMap.get(module.id)) : true) : module.enabled),
      ),
    }))

    return NextResponse.json({ success: true, modules, source })
  } catch (error: any) {
    console.error("Error fetching user modules:", error)
    return adminErrorResponse(error, "Failed to fetch user modules")
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await request.json()
    const userId = String(body.userId || "").trim()
    const modules = Array.isArray(body.modules) ? body.modules : []

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 })
    }

    const lookupContext = normalizeTenantContext(
      sessionUser.role === "owner" ? undefined : sessionUser.tenantId,
      sessionUser.role,
    )
    const userRows = await runTenantQuery(
      sql,
      lookupContext,
      sql`
        SELECT id, tenant_id, role
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
    )

    if (!userRows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const tenantId = String(userRows[0].tenant_id)
    const targetRole = String(userRows[0].role || "")
    if (sessionUser.role !== "owner" && tenantId !== sessionUser.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantModules = await runTenantQuery(
      sql,
      normalizeTenantContext(tenantId, sessionUser.role),
      sql`
        SELECT module, enabled
        FROM tenant_modules
        WHERE tenant_id = ${tenantId}
      `,
    )
    const tenantEnabled = tenantModules?.length ? resolveEnabledModules(tenantModules) : resolveEnabledModules()

    const beforeModules = await runTenantQuery(
      sql,
      normalizeTenantContext(tenantId, sessionUser.role),
      sql`
        SELECT module, enabled
        FROM user_modules
        WHERE user_id = ${userId}
      `,
    )

    const effectiveModules: ModuleState[] = []
    for (const moduleId of MODULE_IDS) {
      const requested = Boolean(modules.find((m: any) => m.id === moduleId)?.enabled)
      const enabled =
        tenantEnabled.includes(moduleId) && applyUserRoleModulePolicy(targetRole, moduleId, requested)
      effectiveModules.push({
        id: moduleId,
        label: MODULE_LABEL_BY_ID.get(moduleId) || moduleId,
        enabled,
      })
      await runTenantQuery(
        sql,
        normalizeTenantContext(tenantId, sessionUser.role),
        sql`
          INSERT INTO user_modules (user_id, tenant_id, module, enabled)
          VALUES (${userId}, ${tenantId}, ${moduleId}, ${enabled})
          ON CONFLICT (user_id, module)
          DO UPDATE SET enabled = ${enabled}
        `,
      )
    }

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "user_modules",
      entityId: userId,
      before: beforeModules ?? null,
      after: effectiveModules,
    })

    await logSecurityEvent({
      tenantId,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "info",
      source: "admin/user-modules",
      metadata: {
        action: "user_modules_updated",
        targetUserId: userId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error updating user modules:", error)
    return adminErrorResponse(error, "Failed to update user modules")
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 })
    }

    const lookupContext = normalizeTenantContext(
      sessionUser.role === "owner" ? undefined : sessionUser.tenantId,
      sessionUser.role,
    )
    const userRows = await runTenantQuery(
      sql,
      lookupContext,
      sql`
        SELECT id, tenant_id
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
    )

    if (!userRows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const tenantId = String(userRows[0].tenant_id)
    if (sessionUser.role !== "owner" && tenantId !== sessionUser.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const beforeModules = await runTenantQuery(
      sql,
      normalizeTenantContext(tenantId, sessionUser.role),
      sql`
        SELECT module, enabled
        FROM user_modules
        WHERE user_id = ${userId}
      `,
    )

    await runTenantQuery(
      sql,
      normalizeTenantContext(tenantId, sessionUser.role),
      sql`
        DELETE FROM user_modules
        WHERE user_id = ${userId}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "user_modules",
      entityId: userId,
      before: beforeModules ?? null,
    })

    await logSecurityEvent({
      tenantId,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "info",
      source: "admin/user-modules",
      metadata: {
        action: "user_modules_reset",
        targetUserId: userId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error resetting user modules:", error)
    return adminErrorResponse(error, "Failed to reset user modules")
  }
}
