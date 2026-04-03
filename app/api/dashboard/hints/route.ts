import { NextResponse } from "next/server"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"

export const dynamic = "force-dynamic"
export const revalidate = 0

export type WorkspaceHint = {
  id: string
  type: "setup" | "tip" | "warning"
  title: string
  body: string
  action?: { label: string; tab: string }
}

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

    const accountCodes = Number(data.account_codes) || 0
    const locationCount = Number(data.location_count) || 0
    const dataCount = Number(data.data_count) || 0
    const totalLogins = Number(data.total_logins) || 0

    const hints: WorkspaceHint[] = []

    if (accountCodes === 0 && totalLogins >= 1) {
      hints.push({
        id: "no-account-codes",
        type: "setup",
        title: "Set up account codes to start entering costs",
        body: "Labor and expense entries need account codes. Add a few under Settings → Accounts to unlock the full accounting view.",
        action: { label: "Go to Settings", tab: "settings" },
      })
    }

    if (locationCount === 0 && totalLogins >= 1) {
      hints.push({
        id: "no-locations",
        type: "setup",
        title: "Add your estate's blocks or sections",
        body: "Locations let you track labor, processing, and sales by section. Add them under Settings → Locations.",
        action: { label: "Go to Settings", tab: "settings" },
      })
    }

    if (totalLogins >= 5 && dataCount === 0 && accountCodes > 0 && locationCount > 0) {
      hints.push({
        id: "no-data-entered",
        type: "tip",
        title: "Ready to log your first entry?",
        body: "Your estate is set up. Try adding today's cherry intake under Processing, or log attendance under Labor.",
        action: { label: "Go to Processing", tab: "processing" },
      })
    }

    return NextResponse.json({ success: true, hints })
  } catch (error) {
    return buildErrorResponse(error, "Failed to load workspace hints", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
