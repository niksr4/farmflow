import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { requireAdminRole } from "@/lib/tenant"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser()
    requireAdminRole(sessionUser.role)

    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const requestedTenantId = searchParams.get("tenantId")
    const tenantId = sessionUser.role === "owner" ? requestedTenantId : sessionUser.tenantId
    const entityType = searchParams.get("entityType")
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = Math.min(Math.max(Number.parseInt(limitParam || "50", 10) || 50, 1), 200)
    const offset = Math.max(Number.parseInt(offsetParam || "0", 10) || 0, 0)

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    if (sessionUser.role !== "owner" && requestedTenantId && requestedTenantId !== sessionUser.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const params: any[] = [tenantId]
    let whereClause = "tenant_id = $1"

    if (entityType) {
      params.push(entityType)
      whereClause += ` AND entity_type = $${params.length}`
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
    return NextResponse.json({ success: false, error: error.message || "Failed to load audit logs" }, { status: 500 })
  }
}
