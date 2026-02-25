import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireAdminSession } from "@/lib/server/mfa"

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const adminErrorResponse = (error: any, fallback: string) => {
  const message = error?.message || fallback
  const status = ["MFA required", "Admin role required", "Owner role required", "Unauthorized"].includes(message) ? 403 : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)

    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = String(searchParams.get("status") || "open").toLowerCase()
    const limitRaw = Number.parseInt(String(searchParams.get("limit") || "200"), 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200
    const tenantId = searchParams.get("tenantId")
    const normalizedStatus = statusFilter === "resolved" ? "resolved" : "open"

    const rowsResult = tenantId
      ? await sql.query(
          `
            SELECT
              die.id,
              die.tenant_id,
              t.name AS tenant_name,
              die.rule_code,
              die.entity_key,
              die.severity,
              die.status,
              die.title,
              die.description,
              die.details,
              die.first_seen_at,
              die.last_seen_at,
              die.resolved_at,
              die.last_run_id
            FROM data_integrity_exceptions die
            LEFT JOIN tenants t ON t.id = die.tenant_id
            WHERE die.status = $1
              AND die.tenant_id = $2::uuid
            ORDER BY die.last_seen_at DESC
            LIMIT $3
          `,
          [normalizedStatus, tenantId, limit],
        )
      : await sql.query(
          `
            SELECT
              die.id,
              die.tenant_id,
              t.name AS tenant_name,
              die.rule_code,
              die.entity_key,
              die.severity,
              die.status,
              die.title,
              die.description,
              die.details,
              die.first_seen_at,
              die.last_seen_at,
              die.resolved_at,
              die.last_run_id
            FROM data_integrity_exceptions die
            LEFT JOIN tenants t ON t.id = die.tenant_id
            WHERE die.status = $1
            ORDER BY die.last_seen_at DESC
            LIMIT $2
          `,
          [normalizedStatus, limit],
        )

    const rows = Array.isArray(rowsResult)
      ? rowsResult
      : Array.isArray((rowsResult as any)?.rows)
        ? (rowsResult as any).rows
        : []

    return NextResponse.json({
      success: true,
      status: normalizedStatus,
      count: rows.length,
      records: (rows || []).map((row: any) => ({
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: row.tenant_name ? String(row.tenant_name) : "Unknown",
        ruleCode: String(row.rule_code),
        entityKey: String(row.entity_key),
        severity: String(row.severity),
        status: String(row.status),
        title: String(row.title),
        description: String(row.description),
        details: row.details && typeof row.details === "object" ? row.details : null,
        firstSeenAt: row.first_seen_at ? new Date(row.first_seen_at).toISOString() : null,
        lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
        resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
        lastRunId: row.last_run_id ? String(row.last_run_id) : null,
      })),
    })
  } catch (error: any) {
    if (isMissingRelation(error, "data_integrity_exceptions")) {
      return NextResponse.json(
        { success: false, error: "data_integrity_exceptions table missing. Run scripts/54-agent-ops.sql" },
        { status: 503 },
      )
    }
    console.error("Error fetching data integrity exceptions:", error)
    return adminErrorResponse(error, "Failed to fetch data integrity exceptions")
  }
}
