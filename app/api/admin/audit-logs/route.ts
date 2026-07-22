import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAdminSession } from "@/lib/server/mfa"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { buildAdminErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { isForbiddenTenantAccess, resolveRequestedTenantId } from "@/lib/permissions"

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()

    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const { searchParams } = new URL(request.url)
    const requestedTenantId = searchParams.get("tenantId")
    const tenantId = resolveRequestedTenantId(sessionUser, requestedTenantId)
    const entityType = searchParams.get("entityType")
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = Math.min(Math.max(Number.parseInt(limitParam || "50", 10) || 50, 1), 200)
    const offset = Math.max(Number.parseInt(offsetParam || "0", 10) || 0, 0)

    // scope=estate returns only business operations; scope=admin returns only platform-level ones.
    // Default is "estate" — admin console actions (user mgmt, module toggles) are excluded.
    const scope = searchParams.get("scope") || "estate"
    const ADMIN_ENTITY_TYPES = ["users", "tenant_modules", "user_modules", "tenants"]

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    if (isForbiddenTenantAccess(sessionUser, requestedTenantId)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const params: any[] = [tenantId]
    let whereClause = "tenant_id = $1"

    if (entityType && entityType !== "all") {
      params.push(entityType)
      whereClause += ` AND entity_type = $${params.length}`
    } else if (scope === "estate") {
      // Exclude platform admin operations from the estate-facing log
      const placeholders = ADMIN_ENTITY_TYPES.map((_, i) => `$${params.length + i + 1}`).join(", ")
      params.push(...ADMIN_ENTITY_TYPES)
      whereClause += ` AND entity_type NOT IN (${placeholders})`
    }

    params.push(limit, offset)

    const [countRows, logs] = await runTenantQueries(sql, tenantContext, [
      sql.query(`SELECT COUNT(*)::int AS count FROM audit_logs WHERE ${whereClause}`, params.slice(0, params.length - 2)),
      sql.query(
        `
        SELECT id, tenant_id, user_id, username, role, action, entity_type, entity_id, before_data, after_data, created_at
        FROM audit_logs
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
        `,
        params,
      ),
    ])

    return NextResponse.json({
      success: true,
      totalCount: Number(countRows?.[0]?.count) || 0,
      logs: logs || [],
    })
  } catch (error: any) {
    console.error("Error fetching audit logs:", error)
    if (isMissingRelation(error, "audit_logs")) {
      return NextResponse.json({ success: true, totalCount: 0, logs: [] })
    }
    return buildAdminErrorResponse(error, "Failed to load audit logs")
  }
}
