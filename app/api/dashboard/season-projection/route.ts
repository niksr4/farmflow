import { NextResponse } from "next/server"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { normalizeTenantContext } from "@/lib/server/tenant-db"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"

export const dynamic = "force-dynamic"
export const revalidate = 0

const LOOKBACK_DAYS = 21
const MIN_DAYS_FOR_PROJECTION = 7

/**
 * Uses the last LOOKBACK_DAYS of cherry intake to project the season-end total
 * via simple linear regression on recent daily intake.
 */
export async function GET() {
  if (!isDbConfigured) return databaseNotConfiguredResponse()

  try {
    const sessionUser = await requireSessionUser()
    const context = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const fy = getCurrentFiscalYear()

    const missingRelation = (err: Error) =>
      err.message?.includes('relation "processing_records" does not exist')

    const [totalsRows, recentRows] = await Promise.all([
      sql!.query(
        `
        SELECT
          COALESCE(SUM(crop_today), 0) AS season_total_kg,
          COUNT(DISTINCT process_date)::int AS season_days
        FROM processing_records
        WHERE tenant_id = $1
          AND process_date >= $2::date
          AND process_date <= CURRENT_DATE
        `,
        [context.tenantId, fy.startDate],
      ).catch((err: Error) => { if (missingRelation(err)) return []; throw err }),
      sql!.query(
        `
        SELECT
          process_date::text,
          SUM(crop_today) AS daily_kg
        FROM processing_records
        WHERE tenant_id = $1
          AND process_date >= (CURRENT_DATE - $2::int)::date
          AND process_date <= CURRENT_DATE
        GROUP BY process_date
        ORDER BY process_date ASC
        `,
        [context.tenantId, LOOKBACK_DAYS],
      ).catch((err: Error) => { if (missingRelation(err)) return []; throw err }),
    ])

    const totals = totalsRows as Array<{ season_total_kg: string; season_days: string }>
    const recent = recentRows as Array<{ process_date: string; daily_kg: string }>

    if (!totals.length || !recent.length) {
      return NextResponse.json({ success: true, hasData: false })
    }

    const seasonTotalKg = Number(totals[0]?.season_total_kg) || 0
    const seasonDays = Number(totals[0]?.season_days) || 0

    if (recent.length < MIN_DAYS_FOR_PROJECTION || seasonTotalKg === 0) {
      return NextResponse.json({ success: true, hasData: false, seasonTotalKg, seasonDays })
    }

    const n = recent.length
    const ys = recent.map((r) => Number(r.daily_kg))
    const xs = ys.map((_, i) => i)
    const xMean = xs.reduce((a, b) => a + b, 0) / n
    const yMean = ys.reduce((a, b) => a + b, 0) / n
    const ssXY = xs.reduce((sum, x, i) => sum + (x - xMean) * (ys[i] - yMean), 0)
    const ssXX = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0)
    const slope = ssXX === 0 ? 0 : ssXY / ssXX
    const intercept = yMean - slope * xMean

    const daysUntilZero = slope < 0 ? Math.round(-intercept / slope) - (n - 1) : null

    let projectedAdditionalKg = 0
    let projectedEndDate: string | null = null

    if (daysUntilZero !== null && daysUntilZero > 0 && daysUntilZero < 180) {
      for (let d = 0; d < daysUntilZero; d++) {
        const futureY = slope * (n - 1 + d) + intercept
        if (futureY > 0) projectedAdditionalKg += futureY
      }
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + daysUntilZero)
      projectedEndDate = endDate.toISOString().slice(0, 10)
    }

    return NextResponse.json({
      success: true,
      hasData: true,
      fiscalYear: fy.label,
      seasonTotalKg: Math.round(seasonTotalKg),
      seasonDays,
      recentAvgDailyKg: Math.round(yMean),
      trendDirection: slope < -0.5 ? "declining" : slope > 0.5 ? "rising" : "flat",
      projectedSeasonTotal: Math.round(seasonTotalKg + projectedAdditionalKg),
      projectedEndDate,
      lookbackDays: LOOKBACK_DAYS,
    })
  } catch (error) {
    return buildErrorResponse(error, "Failed to load season projection", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
