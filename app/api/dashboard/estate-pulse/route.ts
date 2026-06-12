import { NextResponse } from "next/server"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { getCoffeePriceAnalysis, estimateSellableStock } from "@/lib/server/coffee-prices"

export const dynamic = "force-dynamic"
export const revalidate = 0

const HEATMAP_DAYS = 182 // 26 weeks
const HEATMAP_WEEKS = 26
const SEASON_WEEKS = 52

const CATEGORY_COLORS = ["#059669", "#f59e0b", "#38bdf8", "#8b5cf6", "#f43f5e"]
const OTHER_COLOR = "#d6d3d1"

const isMissingRelation = (error: unknown, relation: string) =>
  String((error as Error)?.message || error).includes(`relation "${relation}" does not exist`)

async function tryQuery<T>(
  context: { tenantId: string; role: string },
  query: ReturnType<typeof sql>,
  missingRelations: string[],
): Promise<{ rows: T[]; ok: boolean }> {
  try {
    const rows = await runTenantQuery<T>(sql!, context, query)
    return { rows, ok: true }
  } catch (error) {
    if (missingRelations.some((r) => isMissingRelation(error, r))) return { rows: [], ok: false }
    throw error
  }
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

export async function GET() {
  if (!isDbConfigured) return databaseNotConfiguredResponse()

  try {
    const sessionUser = await requireSessionUser()
    const context = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const fy = getCurrentFiscalYear()

    const fyStartYear = Number(fy.startDate.slice(0, 4))
    const prevFyStart = `${fyStartYear - 1}-04-01`
    const prevFyEnd = `${fyStartYear}-03-31`

    const today = new Date()
    const fyStartDate = new Date(`${fy.startDate}T00:00:00Z`)
    const daysSinceFyStart = Math.floor((today.getTime() - fyStartDate.getTime()) / 86_400_000)
    const weeksElapsed = Math.min(SEASON_WEEKS, Math.max(1, Math.floor(daysSinceFyStart / 7) + 1))

    const [
      thisSeasonResult,
      lastSeasonResult,
      expenseCategoryResult,
      laborTotalResult,
      topLocationsResult,
      rainfallResult,
      heatmapResult,
      marketTimingData,
    ] = await Promise.all([
      tryQuery<{ week_idx: number; output_kg: number }>(
        context,
        sql!`
          SELECT ((process_date - ${fy.startDate}::date) / 7)::int AS week_idx,
                 COALESCE(SUM(dry_parch), 0) + COALESCE(SUM(dry_cherry), 0) AS output_kg
          FROM processing_records
          WHERE tenant_id = ${context.tenantId}
            AND process_date >= ${fy.startDate}::date
            AND process_date <= ${fy.endDate}::date
          GROUP BY week_idx
          ORDER BY week_idx
        `,
        ["processing_records"],
      ),
      tryQuery<{ week_idx: number; output_kg: number }>(
        context,
        sql!`
          SELECT ((process_date - ${prevFyStart}::date) / 7)::int AS week_idx,
                 COALESCE(SUM(dry_parch), 0) + COALESCE(SUM(dry_cherry), 0) AS output_kg
          FROM processing_records
          WHERE tenant_id = ${context.tenantId}
            AND process_date >= ${prevFyStart}::date
            AND process_date <= ${prevFyEnd}::date
          GROUP BY week_idx
          ORDER BY week_idx
        `,
        ["processing_records"],
      ),
      tryQuery<{ category: string; amount: number }>(
        context,
        sql!`
          SELECT aa.activity AS category, COALESCE(SUM(et.total_amount), 0) AS amount
          FROM expense_transactions et
          JOIN account_activities aa ON aa.code = et.code AND aa.tenant_id = et.tenant_id
          WHERE et.tenant_id = ${context.tenantId}
            AND et.entry_date >= ${fy.startDate}::date
            AND et.entry_date <= ${fy.endDate}::date
          GROUP BY aa.activity
          ORDER BY amount DESC
        `,
        ["expense_transactions", "account_activities"],
      ),
      tryQuery<{ total_cost: number }>(
        context,
        sql!`
          SELECT COALESCE(SUM(total_cost), 0) AS total_cost
          FROM labor_transactions
          WHERE tenant_id = ${context.tenantId}
            AND deployment_date >= ${fy.startDate}::date
            AND deployment_date <= ${fy.endDate}::date
        `,
        ["labor_transactions"],
      ),
      tryQuery<{ location_name: string; output_kg: number }>(
        context,
        sql!`
          SELECT l.name AS location_name,
                 COALESCE(SUM(pr.dry_parch), 0) + COALESCE(SUM(pr.dry_cherry), 0) AS output_kg
          FROM processing_records pr
          JOIN locations l ON l.id = pr.location_id
          WHERE pr.tenant_id = ${context.tenantId}
            AND pr.process_date >= ${fy.startDate}::date
            AND pr.process_date <= ${fy.endDate}::date
          GROUP BY l.name
          HAVING COALESCE(SUM(pr.dry_parch), 0) + COALESCE(SUM(pr.dry_cherry), 0) > 0
          ORDER BY output_kg DESC
          LIMIT 5
        `,
        ["processing_records", "locations"],
      ),
      tryQuery<{ record_date: string; inches: number; cents: number }>(
        context,
        sql!`
          SELECT record_date::text AS record_date, inches, cents
          FROM rainfall_records
          WHERE tenant_id = ${context.tenantId}
            AND record_date >= CURRENT_DATE - INTERVAL '13 days'
            AND record_date <= CURRENT_DATE
          ORDER BY record_date
        `,
        ["rainfall_records"],
      ),
      tryQuery<{ day: string; cnt: number }>(
        context,
        sql!`
          SELECT (recorded_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day, COUNT(*) AS cnt
          FROM (
            SELECT created_at AS recorded_at FROM processing_records WHERE tenant_id = ${context.tenantId}
            UNION ALL
            SELECT created_at FROM picking_records WHERE tenant_id = ${context.tenantId}
            UNION ALL
            SELECT created_at FROM attendance_records WHERE tenant_id = ${context.tenantId}
            UNION ALL
            SELECT created_at FROM sales_records WHERE tenant_id = ${context.tenantId}
            UNION ALL
            SELECT created_at FROM dispatch_records WHERE tenant_id = ${context.tenantId}
            UNION ALL
            SELECT deployment_date FROM labor_transactions WHERE tenant_id = ${context.tenantId}
            UNION ALL
            SELECT entry_date FROM expense_transactions WHERE tenant_id = ${context.tenantId}
          ) t
          WHERE recorded_at >= NOW() - (INTERVAL '1 day' * ${HEATMAP_DAYS})
          GROUP BY day
        `,
        [
          "processing_records",
          "picking_records",
          "attendance_records",
          "sales_records",
          "dispatch_records",
          "labor_transactions",
          "expense_transactions",
        ],
      ),
      Promise.all([getCoffeePriceAnalysis(), estimateSellableStock(context.tenantId)]),
    ])

    // ── Production trend ──────────────────────────────────────────────
    const thisSeasonMap = new Map(thisSeasonResult.rows.map((r) => [Number(r.week_idx), Number(r.output_kg)]))
    const lastSeasonMap = new Map(lastSeasonResult.rows.map((r) => [Number(r.week_idx), Number(r.output_kg)]))

    const weeks: Array<{ week: string; thisSeason: number | null; lastSeason: number }> = []
    for (let i = 0; i < SEASON_WEEKS; i++) {
      weeks.push({
        week: `Wk ${i + 1}`,
        thisSeason: i < weeksElapsed ? thisSeasonMap.get(i) ?? 0 : null,
        lastSeason: lastSeasonMap.get(i) ?? 0,
      })
    }

    const thisSeasonTotal = Array.from(thisSeasonMap.values()).reduce((sum, v) => sum + v, 0)
    const lastSeasonTotal = Array.from(lastSeasonMap.values()).reduce((sum, v) => sum + v, 0)
    const productionTrendHasData = thisSeasonResult.ok && (thisSeasonTotal > 0 || lastSeasonTotal > 0)

    // ── Best week (derived from this-season weekly series) ──────────────
    let bestWeekIdx = -1
    let bestWeekKg = 0
    for (let i = 0; i < weeksElapsed; i++) {
      const kg = thisSeasonMap.get(i) ?? 0
      if (kg > bestWeekKg) {
        bestWeekKg = kg
        bestWeekIdx = i
      }
    }
    const elapsedTotal = Array.from({ length: weeksElapsed }, (_, i) => thisSeasonMap.get(i) ?? 0).reduce(
      (sum, v) => sum + v,
      0,
    )
    const avgWeekKg = weeksElapsed > 0 ? elapsedTotal / weeksElapsed : 0
    const bestWeekHasData = productionTrendHasData && bestWeekIdx >= 0 && bestWeekKg > 0

    let bestWeekLabel = ""
    let bestWeekNote = ""
    if (bestWeekHasData) {
      const weekStart = new Date(`${fy.startDate}T00:00:00Z`)
      weekStart.setUTCDate(weekStart.getUTCDate() + bestWeekIdx * 7)
      bestWeekLabel = `Week of ${weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}`
      const pctAboveAvg = avgWeekKg > 0 ? Math.round(((bestWeekKg - avgWeekKg) / avgWeekKg) * 100) : 0
      bestWeekNote = pctAboveAvg > 0 ? `${pctAboveAvg}% above this season's average week` : "Highest output week this season"
    }

    // ── Cost breakdown ────────────────────────────────────────────────
    const laborTotal = Number(laborTotalResult.rows[0]?.total_cost) || 0
    const expenseRows = expenseCategoryResult.rows
      .map((r) => ({ category: String(r.category), amount: Number(r.amount) || 0 }))
      .filter((r) => r.amount > 0)

    const categories: Array<{ category: string; amount: number; color: string }> = []
    let colorIdx = 0
    if (laborTotal > 0) categories.push({ category: "Labour", amount: laborTotal, color: CATEGORY_COLORS[colorIdx++] })
    const TOP_N = 4
    const topExpenses = expenseRows.slice(0, TOP_N)
    const otherExpenses = expenseRows.slice(TOP_N)
    for (const e of topExpenses) {
      categories.push({ category: e.category, amount: e.amount, color: CATEGORY_COLORS[colorIdx++ % CATEGORY_COLORS.length] })
    }
    const otherTotal = otherExpenses.reduce((sum, e) => sum + e.amount, 0)
    if (otherTotal > 0) categories.push({ category: "Other", amount: otherTotal, color: OTHER_COLOR })

    const costBreakdownTotal = categories.reduce((sum, c) => sum + c.amount, 0)

    // ── Rainfall + field signal ──────────────────────────────────────
    const rainfallByDate = new Map(
      rainfallResult.rows.map((r) => [String(r.record_date).slice(0, 10), Number(r.inches) + Number(r.cents) / 100]),
    )
    const rainfallDays: Array<{ day: string; inches: number }> = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      const key = isoDate(d)
      rainfallDays.push({
        day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
        inches: Math.round((rainfallByDate.get(key) ?? 0) * 100) / 100,
      })
    }
    const last7 = rainfallDays.slice(7).reduce((sum, d) => sum + d.inches, 0)
    const prior7 = rainfallDays.slice(0, 7).reduce((sum, d) => sum + d.inches, 0)

    let rainfallSignal = { title: "Steady conditions", detail: `${last7.toFixed(2)} in over the last 7 days, similar to the prior week.` }
    if (last7 === 0 && prior7 === 0) {
      rainfallSignal = { title: "No recent rainfall", detail: "No rainfall logged in the last 14 days." }
    } else if (last7 === 0 && prior7 > 0) {
      rainfallSignal = { title: "Dry spell", detail: `No rain in the last 7 days, after ${prior7.toFixed(2)} in the prior week.` }
    } else if (prior7 > 0 && last7 > prior7 * 1.3) {
      rainfallSignal = { title: "Rainfall picking up", detail: `${last7.toFixed(2)} in this week, up from ${prior7.toFixed(2)} in last week — check drainage on low-lying plots.` }
    } else if (prior7 > 0 && last7 < prior7 * 0.5) {
      rainfallSignal = { title: "Rainfall easing", detail: `${last7.toFixed(2)} in this week, down from ${prior7.toFixed(2)} in last week.` }
    }

    // ── Market timing ─────────────────────────────────────────────────
    const [priceAnalysis, sellableStock] = marketTimingData

    // ── Activity heatmap ──────────────────────────────────────────────
    const heatmapCounts = new Map(heatmapResult.rows.map((r) => [String(r.day).slice(0, 10), Number(r.cnt)]))
    const heatmapDays: number[] = []
    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      const cnt = heatmapCounts.get(isoDate(d)) ?? 0
      heatmapDays.push(cnt === 0 ? 0 : Math.min(4, cnt))
    }
    const heatmapWeeks: number[][] = []
    for (let w = 0; w < HEATMAP_WEEKS; w++) {
      heatmapWeeks.push(heatmapDays.slice(w * 7, w * 7 + 7))
    }
    const activityHeatmapHasData = heatmapResult.ok && heatmapDays.some((level) => level > 0)

    return NextResponse.json({
      success: true,
      fiscalYear: { startDate: fy.startDate, endDate: fy.endDate, label: fy.label },
      productionTrend: { hasData: productionTrendHasData, weeks },
      bestWeek: {
        hasData: bestWeekHasData,
        label: bestWeekLabel,
        cherryKg: bestWeekKg,
        note: bestWeekNote,
      },
      costBreakdown: { hasData: costBreakdownTotal > 0, categories },
      rainfallSignal: { hasData: rainfallResult.ok && rainfallResult.rows.length > 0, days: rainfallDays, signal: rainfallSignal },
      marketTiming: priceAnalysis
        ? {
            hasData: true,
            currentUsdPerKg: Math.round(priceAnalysis.usdPerKg * 100) / 100,
            signal: priceAnalysis.signal,
            signalSummary: priceAnalysis.signalSummary,
            trend: priceAnalysis.series.map((p) => ({
              month: new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }),
              price: Math.round(p.usdPerLb * 2.2046 * 100) / 100,
            })),
            estimatedUnsoldKg: Math.round(sellableStock?.availableKg ?? 0),
          }
        : { hasData: false },
      rankings: {
        topLocations: {
          hasData: topLocationsResult.ok && topLocationsResult.rows.length > 0,
          items: topLocationsResult.rows.map((r) => ({ label: r.location_name, value: Number(r.output_kg) })),
        },
        topExpenseCategories: {
          hasData: expenseRows.length > 0,
          items: expenseRows.slice(0, 5).map((r) => ({ label: r.category, value: r.amount })),
        },
      },
      activityHeatmap: { hasData: activityHeatmapHasData, weeks: heatmapWeeks },
    })
  } catch (error) {
    return buildErrorResponse(error, "Failed to load estate pulse data", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
