import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAdminSession } from "@/lib/server/mfa"
import { requireOwnerRole } from "@/lib/tenant"
import { MODULES, resolveModuleStates } from "@/lib/modules"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logSecurityEvent } from "@/lib/server/security-events"

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
    const requestedTenantId = searchParams.get("tenantId")
    const tenantId = sessionUser.role === "owner" ? requestedTenantId : sessionUser.tenantId

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

    const modules = resolveModuleStates(rows)

    return NextResponse.json({ success: true, modules })
  } catch (error: any) {
    console.error("Error fetching tenant modules:", error)
    return adminErrorResponse(error, "Failed to fetch tenant modules")
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await request.json()
    const requestedTenantId = String(body.tenantId || "").trim()
    const tenantId = sessionUser.role === "owner" ? requestedTenantId : sessionUser.tenantId
    const modules = Array.isArray(body.modules) ? body.modules : []

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
    for (const moduleEntry of MODULES) {
      const enabled = Boolean(modules.find((m: any) => m.id === moduleEntry.id)?.enabled)
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO tenant_modules (tenant_id, module, enabled)
          VALUES (${tenantId}, ${moduleEntry.id}, ${enabled})
          ON CONFLICT (tenant_id, module)
          DO UPDATE SET enabled = ${enabled}
        `,
      )
    }

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "tenant_modules",
      entityId: tenantId,
      before: beforeRows ?? null,
      after: modules,
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
        moduleCount: modules.length,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error updating tenant modules:", error)
    return adminErrorResponse(error, "Failed to update tenant modules")
  }
}
