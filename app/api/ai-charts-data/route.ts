import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { getFiscalYearDateRange, getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("ai-analysis")
    const tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const fiscalYearStart = searchParams.get("fiscalYearStart")
    const fiscalYearEnd = searchParams.get("fiscalYearEnd")

    const fiscalYear = getCurrentFiscalYear()
    const { startDate, endDate } = getFiscalYearDateRange(fiscalYear)
    const start = fiscalYearStart || startDate
    const end = fiscalYearEnd || endDate

    let laborData: unknown[] = []
    try {
      laborData = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT 
            deployment_date,
            hf_laborers,
            hf_cost_per_laborer,
            outside_laborers,
            outside_cost_per_laborer,
            total_cost,
            code
        FROM labor_transactions
        WHERE deployment_date >= ${start}::date AND deployment_date <= ${end}::date
          AND tenant_id = ${tenantId}
        ORDER BY deployment_date DESC
      `,
      )
    } catch (error) {
      console.error("Error fetching labor data:", error)
    }

    const processingRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT 
          pr.process_date,
          pr.crop_today,
          pr.ripe_today,
          pr.dry_parch,
          pr.dry_cherry,
          pr.dry_p_bags,
          pr.dry_cherry_bags,
          pr.dry_p_bags_todate,
          pr.dry_cherry_bags_todate,
          pr.coffee_type,
          l.name as location_name
        FROM processing_records pr
        JOIN locations l ON l.id = pr.location_id
        WHERE pr.process_date >= ${start}::date AND pr.process_date <= ${end}::date
          AND pr.tenant_id = ${tenantId}
        ORDER BY pr.process_date DESC
      `,
    )

    const processingData: Record<string, unknown[]> = {}
    for (const row of processingRows) {
      const key = `${row.location_name} ${row.coffee_type}`.trim()
      if (!processingData[key]) {
        processingData[key] = []
      }
      processingData[key].push(row)
    }

    return NextResponse.json({
      success: true,
      laborData,
      processingData,
    })
  } catch (error) {
    console.error("AI Charts data error:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
