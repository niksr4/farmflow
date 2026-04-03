import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAdminSession } from "@/lib/server/mfa"
import { requireOwnerRole } from "@/lib/tenant"
import {
  MODULE_BUNDLES,
  clampRequestedModuleStatesToPlan,
  normalizeTenantPlanId,
  resolveModuleStates,
  resolveTenantEnabledModules,
} from "@/lib/modules"
import { persistTenantPlanId, resolveTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logSecurityEvent } from "@/lib/server/security-events"
import { buildAdminErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { invalidateModuleCache } from "@/lib/module-access"

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const { searchParams } = new URL(request.url)
    const requestedTenantId = searchParams.get("tenantId")
    const tenantId = sessionUser.role === "owner" ? requestedTenantId : sessionUser.tenantId
    const allowPlanOverrides = sessionUser.role === "owner" && searchParams.get("includePlanOverrides") === "true"

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    if (sessionUser.role !== "owner" && requestedTenantId && requestedTenantId !== sessionUser.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT module, enabled
        FROM tenant_modules
        WHERE tenant_id = ${tenantId}
      `,
    )

    const planId = await resolveTenantPlanId({
      db: sql,
      tenantId,
      role: sessionUser.role,
      moduleRows: rows as Array<{ module: string; enabled: boolean }>,
    })
    const modules = resolveModuleStates(rows, { planId, allowPlanOverrides })

    return NextResponse.json({ success: true, modules, planId, plans: MODULE_BUNDLES })
  } catch (error: any) {
    console.error("Error fetching tenant modules:", error)
    return buildAdminErrorResponse(error, "Failed to fetch tenant modules")
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const body = await request.json()
    const requestedTenantId = String(body.tenantId || "").trim()
    const tenantId = sessionUser.role === "owner" ? requestedTenantId : sessionUser.tenantId
    const modules = Array.isArray(body.modules) ? body.modules : []
    const requestedPlanId = body.planId ? normalizeTenantPlanId(body.planId) : null
    const allowPlanOverrides = sessionUser.role === "owner" && body.allowPlanOverride === true

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    if (sessionUser.role !== "owner" && requestedTenantId && requestedTenantId !== sessionUser.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const beforeRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT module, enabled
        FROM tenant_modules
        WHERE tenant_id = ${tenantId}
      `,
    )
    const nextPlanId =
      requestedPlanId ||
      (await resolveTenantPlanId({
        db: sql,
        tenantId,
        role: sessionUser.role,
        moduleRows: beforeRows as Array<{ module: string; enabled: boolean }>,
      }))
    const effectiveModules = clampRequestedModuleStatesToPlan(modules, nextPlanId, { allowPlanOverrides })

    for (const moduleEntry of effectiveModules) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO tenant_modules (tenant_id, module, enabled)
          VALUES (${tenantId}, ${moduleEntry.id}, ${moduleEntry.enabled})
          ON CONFLICT (tenant_id, module)
          DO UPDATE SET enabled = ${moduleEntry.enabled}
        `,
      )
    }

    await persistTenantPlanId(sql, tenantId, sessionUser.role, nextPlanId)
    invalidateModuleCache(tenantId)

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "tenant_modules",
      entityId: tenantId,
      before: beforeRows ?? null,
      after: {
        planId: nextPlanId,
        modules: effectiveModules,
      },
    })

    await logSecurityEvent({
      tenantId,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "info",
      source: "admin/tenant-modules",
      metadata: {
        action: "tenant_modules_updated",
        moduleCount: resolveTenantEnabledModules(
          effectiveModules.map((module) => ({ module: module.id, enabled: module.enabled })),
          nextPlanId,
          { allowPlanOverrides: true },
        ).length,
        planId: nextPlanId,
        allowPlanOverrides,
      },
    })

    return NextResponse.json({ success: true, modules: effectiveModules, planId: nextPlanId, plans: MODULE_BUNDLES })
  } catch (error: any) {
    console.error("Error updating tenant modules:", error)
    return buildAdminErrorResponse(error, "Failed to update tenant modules", { ownerRequired: true })
  }
}
