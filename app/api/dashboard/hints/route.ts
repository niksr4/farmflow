import { NextResponse } from "next/server"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { buildTenantWorkspaceHints } from "@/lib/tenant-guidance"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  if (!isDbConfigured) return databaseNotConfiguredResponse()

  try {
    const sessionUser = await requireSessionUser()
    if (sessionUser.role === "owner") {
      return NextResponse.json({ success: true, hints: [] })
    }

    const tenantId = sessionUser.tenantId
    const context = normalizeTenantContext(tenantId, sessionUser.role)

    const rows = await runTenantQuery<{
      account_codes: number
      location_count: number
      data_count: number
      total_logins: number
    }>(
      sql,
      context,
      sql`
        SELECT
          (SELECT COUNT(*) FROM account_activities WHERE tenant_id = ${tenantId})::int  AS account_codes,
          (SELECT COUNT(*) FROM locations        WHERE tenant_id = ${tenantId})::int  AS location_count,
          (
            SELECT COUNT(*) FROM (
              SELECT id FROM labor_transactions   WHERE tenant_id = ${tenantId}
              UNION ALL
              SELECT id FROM processing_records   WHERE tenant_id = ${tenantId}
              UNION ALL
              SELECT id FROM expense_transactions WHERE tenant_id = ${tenantId}
              UNION ALL
              SELECT id FROM sales_records        WHERE tenant_id = ${tenantId}
            ) sub
          )::int AS data_count,
          (
            SELECT COUNT(*) FROM security_events
            WHERE tenant_id = ${tenantId} AND event_type = 'auth_login_success'
          )::int AS total_logins
      `,
    )

    const data = rows[0]
    if (!data) return NextResponse.json({ success: true, hints: [] })

    const hints = buildTenantWorkspaceHints({
      accountCodesCount: Number(data.account_codes) || 0,
      locationCount: Number(data.location_count) || 0,
      operationalDataCount: Number(data.data_count) || 0,
      totalLogins: Number(data.total_logins) || 0,
    })

    return NextResponse.json({ success: true, hints })
  } catch (error) {
    return buildErrorResponse(error, "Failed to load workspace hints", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
