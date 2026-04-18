import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAdminSession } from "@/lib/server/mfa"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { buildAdminErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"

// Maps a source name to a SQL fragment for the UNION.
// Returns null if the source is unknown (for safety).
const VALID_SOURCES = ["labor", "expense", "inventory"] as const
type ActivitySource = (typeof VALID_SOURCES)[number]

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
    const tenantId = sessionUser.role === "owner" ? requestedTenantId : sessionUser.tenantId
    const sourceFilter = searchParams.get("source") || "all"
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

    // Build which sources to include in the UNION.
    // If a specific valid source is requested, only include that branch.
    const isSourceFilter = VALID_SOURCES.includes(sourceFilter as ActivitySource)
    const includeSources: ActivitySource[] = isSourceFilter
      ? [sourceFilter as ActivitySource]
      : [...VALID_SOURCES]

    const laborBranch = `
      SELECT
        lt.id::text                                                AS id,
        'labor'                                                    AS source,
        lt.deployment_date::date                                   AS event_date,
        COALESCE(aa.activity, lt.code)                            AS title,
        COALESCE(lt.task_description, lt.notes)                   AS subtitle,
        lt.total_cost                                              AS amount,
        (SELECT al.username FROM audit_logs al
         WHERE al.entity_id = lt.id::text
           AND al.entity_type = 'labor_transactions'
           AND al.tenant_id = lt.tenant_id
         ORDER BY al.created_at ASC LIMIT 1)                      AS username
      FROM labor_transactions lt
      LEFT JOIN account_activities aa
        ON aa.code = lt.code AND aa.tenant_id = lt.tenant_id
      WHERE lt.tenant_id = $1
    `

    const expenseBranch = `
      SELECT
        et.id::text                                                AS id,
        'expense'                                                  AS source,
        et.entry_date::date                                        AS event_date,
        COALESCE(aa.activity, et.code)                            AS title,
        et.notes                                                   AS subtitle,
        et.total_amount                                            AS amount,
        (SELECT al.username FROM audit_logs al
         WHERE al.entity_id = et.id::text
           AND al.entity_type = 'expense_transactions'
           AND al.tenant_id = et.tenant_id
         ORDER BY al.created_at ASC LIMIT 1)                      AS username
      FROM expense_transactions et
      LEFT JOIN account_activities aa
        ON aa.code = et.code AND aa.tenant_id = et.tenant_id
      WHERE et.tenant_id = $1
    `

    const inventoryBranch = `
      SELECT
        th.id::text                                                AS id,
        'inventory'                                                AS source,
        th.transaction_date::date                                  AS event_date,
        th.item_type                                               AS title,
        CASE th.transaction_type
          WHEN 'restock' THEN 'Stock added'
          WHEN 'deplete' THEN 'Stock used'
          WHEN 'adjust'  THEN 'Adjustment'
          ELSE th.transaction_type
        END                                                        AS subtitle,
        th.total_cost                                              AS amount,
        (SELECT al.username FROM audit_logs al
         WHERE al.entity_id = th.id::text
           AND al.entity_type = 'transaction_history'
           AND al.tenant_id = th.tenant_id
         ORDER BY al.created_at ASC LIMIT 1)                      AS username
      FROM transaction_history th
      WHERE th.tenant_id = $1
    `

    const branchMap: Record<ActivitySource, string> = {
      labor: laborBranch,
      expense: expenseBranch,
      inventory: inventoryBranch,
    }

    const unionSql = includeSources.map((s) => branchMap[s]).join("\nUNION ALL\n")

    const countSql = `
      SELECT COUNT(*)::int AS count
      FROM (
        ${unionSql}
      ) unified
    `

    const rowsSql = `
      SELECT id, source, event_date::text, title, subtitle, amount, username
      FROM (
        ${unionSql}
      ) unified
      ORDER BY event_date DESC, id DESC
      LIMIT $2 OFFSET $3
    `

    const params = [tenantId, limit, offset]
    const countParams = [tenantId]

    const [countRows, records] = await runTenantQueries(sql, tenantContext, [
      sql.query(countSql, countParams),
      sql.query(rowsSql, params),
    ])

    return NextResponse.json({
      success: true,
      totalCount: Number(countRows?.[0]?.count) || 0,
      records: records || [],
    })
  } catch (error: any) {
    console.error("Error fetching tenant activity:", error)
    if (
      isMissingRelation(error, "labor_transactions") ||
      isMissingRelation(error, "expense_transactions") ||
      isMissingRelation(error, "transaction_history")
    ) {
      return NextResponse.json({ success: true, totalCount: 0, records: [] })
    }
    return buildAdminErrorResponse(error, "Failed to load tenant activity")
  }
}
