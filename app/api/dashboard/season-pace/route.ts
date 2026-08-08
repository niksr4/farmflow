import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { resolveScopedSessionUser } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Returns weekly cumulative cherry intake for the current and prior fiscal year.
 * week_num is 1-indexed from the FY start (April 1).
 */
export async function GET(request: Request) {
  if (!isDbConfigured) return databaseNotConfiguredResponse()

  try {
    // resolveScopedSessionUser translates an owner's session into whichever tenant they're
    // currently previewing (farmflow_preview_tenant cookie) -- without it, an owner in preview
    // mode sees their own real tenant's data here regardless of which tenant they're viewing.
    const sessionUser = await resolveScopedSessionUser(await requireSessionUser())
    const context = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const fy = getCurrentFiscalYear()

    const prevFyStart = fy.startDate.replace(/^(\d{4})/, (y) => String(Number(y) - 1))
    const prevFyEnd = fy.endDate.replace(/^(\d{4})/, (y) => String(Number(y) - 1))

    // A tenant owner running multiple estates needs each one to read as its own profitability
    // center -- this feeds the season-pace chart, so it must respect the same estate filter as
    // everywhere else. A NULL location_id is never "the other estate's" -- it must still count
    // regardless of which estate is active. $1 is already context.tenantId.
    const { searchParams } = new URL(request.url)
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const params = [context.tenantId, fy.startDate, fy.endDate, prevFyStart, prevFyEnd]
    let estateClause = ""
    if (activeEstate) {
      params.push(activeEstate)
      estateClause = ` AND (location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE tenant_id = $1 AND estate = $${params.length}))`
    }

    const rows = await runTenantQuery(sql!, context, sql!.query(
      `
      SELECT
        fy,
        week_num,
        SUM(weekly_cherry) OVER (PARTITION BY fy ORDER BY week_num) AS week_cherry_kg
      FROM (
        SELECT
          'current' AS fy,
          CEIL(
            (process_date::date - $2::date + 1)::numeric / 7
          )::int AS week_num,
          SUM(crop_today) AS weekly_cherry
        FROM processing_records
        WHERE tenant_id = $1
          AND process_date >= $2::date
          AND process_date <= $3::date
          ${estateClause}
        GROUP BY week_num

        UNION ALL

        SELECT
          'prior' AS fy,
          CEIL(
            (process_date::date - $4::date + 1)::numeric / 7
          )::int AS week_num,
          SUM(crop_today) AS weekly_cherry
        FROM processing_records
        WHERE tenant_id = $1
          AND process_date >= $4::date
          AND process_date <= $5::date
          ${estateClause}
        GROUP BY week_num
      ) weekly
      ORDER BY fy, week_num
      `,
      params,
    )).catch((err: Error) => {
      if (err.message?.includes('relation "processing_records" does not exist')) return []
      throw err
    })

    const current: Array<{ week: number; cumulative: number }> = []
    const prior: Array<{ week: number; cumulative: number }> = []
    for (const row of rows as Array<{ fy: string; week_num: number; week_cherry_kg: number }>) {
      const point = { week: Number(row.week_num), cumulative: Math.round(Number(row.week_cherry_kg)) }
      if (row.fy === "current") current.push(point)
      else prior.push(point)
    }

    return NextResponse.json({
      success: true,
      fiscalYear: fy.label,
      current,
      prior,
    })
  } catch (error) {
    return buildErrorResponse(error, "Failed to load season pace data", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
