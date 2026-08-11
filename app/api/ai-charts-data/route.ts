import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { sql } from "@/lib/server/db"
import { getFiscalYearDateRange, getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Scopes the analysis charts to the estate selected in the header, matching every other read
 * endpoint. Without it, picking one estate and opening AI analysis charted the whole tenant --
 * and the charts are grouped by location name, so the extra series looked like real findings
 * about the selected estate rather than another estate's data.
 *
 * Same shape as the ops export's fragment: written against the joined `locations l` alias, a
 * no-op when nothing is selected, and `l.id IS NULL` keeps unassigned records visible under
 * every estate (the always-NULL-shows convention in lib/estate-filter.ts).
 */
const estateScope = (estate: string | null) =>
  sql`AND (${estate}::text IS NULL OR l.id IS NULL OR l.estate = ${estate})`

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

    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)

    let laborData: unknown[] = []
    try {
      laborData = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT
            lt.deployment_date,
            lt.hf_laborers,
            lt.hf_cost_per_laborer,
            lt.outside_laborers,
            lt.outside_cost_per_laborer,
            lt.total_cost,
            lt.code
          FROM labor_transactions lt
          LEFT JOIN locations l ON l.id = lt.location_id
          WHERE lt.deployment_date >= ${start}::date AND lt.deployment_date <= ${end}::date
            AND lt.tenant_id = ${tenantId}
            ${estateScope(activeEstate)}
          ORDER BY lt.deployment_date DESC
        `,
      )
    } catch (error) {
      console.error("Error fetching labour data:", error)
    }

    let processingRows: any[] = []
    try {
      processingRows = await runTenantQuery(
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
          LEFT JOIN locations l ON l.id = pr.location_id
          WHERE pr.process_date >= ${start}::date AND pr.process_date <= ${end}::date
            AND pr.tenant_id = ${tenantId}
            ${estateScope(activeEstate)}
          ORDER BY pr.process_date DESC
        `,
      )
    } catch (error) {
      console.error("Error fetching processing data:", error)
    }

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
      { success: false, error: sanitizeRouteError(error, "Unknown error") },
      { status: 500 },
    )
  }
}
