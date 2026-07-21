import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { buildClaudeRouteErrorResponse, classifyClaudeRouteError } from "@/lib/server/claude-errors"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { logServerError, logServerWarning } from "@/lib/server/safe-logging"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { CLAUDE_HAIKU } from "@/lib/server/claude"
import { callAI, isAIConfigured } from "@/lib/server/ai-provider"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { readResponseCache, writeResponseCache } from "@/lib/server/response-cache"

export const dynamic = "force-dynamic"
export const revalidate = 0

type SeasonMetrics = {
  pulpingKg: number
  dispatchBags: number
  salesKg: number
  salesRevenue: number
  laborCost: number
  expenseCost: number
}

async function fetchSeasonAggregates(
  tenantContext: ReturnType<typeof normalizeTenantContext>,
  startDate: string,
  endDate: string,
): Promise<SeasonMetrics> {
  if (!sql) return { pulpingKg: 0, dispatchBags: 0, salesKg: 0, salesRevenue: 0, laborCost: 0, expenseCost: 0 }

  const [processing, dispatch, sales, labor, expenses] = await Promise.all([
    runTenantQuery(sql, tenantContext, sql`
      SELECT COALESCE(SUM(crop_today), 0) AS total_kg
      FROM processing_records
      WHERE process_date >= ${startDate}::date AND process_date <= ${endDate}::date
        AND tenant_id = ${tenantContext.tenantId}
    `).catch(() => []),
    runTenantQuery(sql, tenantContext, sql`
      SELECT COALESCE(SUM(bags_dispatched), 0) AS total_bags
      FROM dispatch_records
      WHERE dispatch_date >= ${startDate} AND dispatch_date <= ${endDate}
        AND tenant_id = ${tenantContext.tenantId}
    `).catch(() => []),
    runTenantQuery(sql, tenantContext, sql`
      SELECT COALESCE(SUM(kgs), 0) AS total_kgs, COALESCE(SUM(revenue), 0) AS total_revenue
      FROM sales_records
      WHERE sale_date >= ${startDate} AND sale_date <= ${endDate}
        AND tenant_id = ${tenantContext.tenantId}
    `).catch(() => []),
    runTenantQuery(sql, tenantContext, sql`
      SELECT COALESCE(SUM(total_cost), 0) AS total_cost
      FROM labor_transactions
      WHERE deployment_date >= ${startDate} AND deployment_date <= ${endDate}
        AND tenant_id = ${tenantContext.tenantId}
    `).catch(() => []),
    runTenantQuery(sql, tenantContext, sql`
      SELECT COALESCE(SUM(total_amount), 0) AS total_amount
      FROM expense_transactions
      WHERE entry_date >= ${startDate} AND entry_date <= ${endDate}
        AND tenant_id = ${tenantContext.tenantId}
    `).catch(() => []),
  ])

  const firstRow = <T>(rows: unknown): T =>
    (Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0]) as T

  return {
    pulpingKg: Number(firstRow<any>(processing)?.total_kg) || 0,
    dispatchBags: Number(firstRow<any>(dispatch)?.total_bags) || 0,
    salesKg: Number(firstRow<any>(sales)?.total_kgs) || 0,
    salesRevenue: Number(firstRow<any>(sales)?.total_revenue) || 0,
    laborCost: Number(firstRow<any>(labor)?.total_cost) || 0,
    expenseCost: Number(firstRow<any>(expenses)?.total_amount) || 0,
  }
}

function pctChange(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? "+∞%" : "—"
  const pct = ((curr - prev) / prev) * 100
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`
}

export async function GET() {
  let rateHeaders: Record<string, string> = {}
  try {
    const sessionUser = await requireModuleAccess("ai-analysis")

    const cacheKey = `ai-season-compare:${sessionUser.tenantId}`
    const cachedCompare = await readResponseCache(cacheKey, 4 * 60 * 60)
    if (cachedCompare !== null) {
      return Response.json({ success: true, ...(cachedCompare as Record<string, unknown>) })
    }

    const rateLimit = await checkRateLimit("aiSeasonCompare", sessionUser.tenantId)
    rateHeaders = buildRateLimitHeaders(rateLimit)

    if (!rateLimit.success) {
      return Response.json(
        { success: false, error: "Rate limit exceeded. Season comparison refreshes every hour." },
        { status: 429, headers: rateHeaders },
      )
    }

    if (!isAIConfigured()) {
      return Response.json({ success: false, error: "AI is not configured" }, { status: 503, headers: rateHeaders })
    }

    if (!sql) {
      return Response.json({ success: false, error: "Database not configured" }, { status: 500, headers: rateHeaders })
    }

    const currentFY = getCurrentFiscalYear()
    const prevFYStartYear = Number(currentFY.startDate.split("-")[0]) - 1
    const prevFY = {
      label: `FY ${String(prevFYStartYear).slice(2)}/${String(prevFYStartYear + 1).slice(2)}`,
      startDate: `${prevFYStartYear}-04-01`,
      endDate: `${prevFYStartYear + 1}-03-31`,
    }

    // Cap both seasons at the same elapsed point so the comparison is fair.
    // e.g. if today is May 28, compare Apr 1–May 28 this year vs Apr 1–May 28 last year.
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]
    const prevYearEquivalent = new Date(today)
    prevYearEquivalent.setFullYear(prevYearEquivalent.getFullYear() - 1)
    const prevYearEquivalentStr = prevYearEquivalent.toISOString().split("T")[0]
    // Clamp prev-year equivalent to within the previous FY bounds
    const prevEndDate = prevYearEquivalentStr > prevFY.endDate ? prevFY.endDate : prevYearEquivalentStr

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const [curr, prev] = await Promise.all([
      fetchSeasonAggregates(tenantContext, currentFY.startDate, todayStr),
      fetchSeasonAggregates(tenantContext, prevFY.startDate, prevEndDate),
    ])

    // Check if there's enough data to compare
    const hasCurrentData = curr.pulpingKg > 0 || curr.salesKg > 0 || curr.dispatchBags > 0
    const hasPrevData = prev.pulpingKg > 0 || prev.salesKg > 0 || prev.dispatchBags > 0

    if (!hasCurrentData && !hasPrevData) {
      return Response.json(
        { success: true, narrative: null, reason: "insufficient_data" },
        { headers: rateHeaders },
      )
    }

    const periodLabel = `${currentFY.startDate} to ${todayStr}`
    const prevPeriodLabel = `${prevFY.startDate} to ${prevEndDate}`

    const dataSummary = `
Same-period season comparison (both windows cover the same elapsed days into the fiscal year):

${prevFY.label} — ${prevPeriodLabel}:
- Pulping output: ${prev.pulpingKg.toLocaleString()} KG
- Dispatch received: ${prev.dispatchBags.toLocaleString()} bags
- Sales volume: ${prev.salesKg.toLocaleString()} KG | Revenue: ₹${prev.salesRevenue.toLocaleString()}
- Labour cost: ₹${prev.laborCost.toLocaleString()} | Other expenses: ₹${prev.expenseCost.toLocaleString()}

${currentFY.label} — ${periodLabel} (in progress, same point in season):
- Pulping output: ${curr.pulpingKg.toLocaleString()} KG  (${pctChange(curr.pulpingKg, prev.pulpingKg)} vs same point last season)
- Dispatch received: ${curr.dispatchBags.toLocaleString()} bags  (${pctChange(curr.dispatchBags, prev.dispatchBags)} vs same point last season)
- Sales volume: ${curr.salesKg.toLocaleString()} KG | Revenue: ₹${curr.salesRevenue.toLocaleString()}  (${pctChange(curr.salesRevenue, prev.salesRevenue)} vs same point last season)
- Labour cost: ₹${curr.laborCost.toLocaleString()} | Other expenses: ₹${curr.expenseCost.toLocaleString()}
    `.trim()

    const narrative =
      (
        await callAI({
          model: CLAUDE_HAIKU,
          max_tokens: 400,
          temperature: 0.2,
          system:
            "You are FarmFlow Season Analyst. Write a concise 2–3 sentence year-on-year comparison for an estate manager. Both periods cover the same number of elapsed days into the fiscal year, so the comparison is apples-to-apples. Ground every observation in the numbers provided. Use INR (₹) and KG. Be specific — name the metric and the percentage. No markdown, no bullet points, plain prose only.",
          messages: [
            {
              role: "user",
              content: `${dataSummary}\n\nWrite a 2–3 sentence YoY season summary highlighting the most important changes. Both windows cover the same elapsed days into the season, so differences are meaningful.`,
            },
          ],
        })
      ).trim() || null

    const comparePayload = {
      narrative,
      currentFY: currentFY.label,
      prevFY: prevFY.label,
      currentPeriod: periodLabel,
      prevPeriod: prevPeriodLabel,
      metrics: { curr, prev },
    }
    await writeResponseCache(cacheKey, comparePayload)
    return Response.json({ success: true, ...comparePayload }, { headers: rateHeaders })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return Response.json({ success: false, error: "Module access disabled" }, { status: 403, headers: rateHeaders })
    }
    const claudeClassification = classifyClaudeRouteError(error)
    if (claudeClassification) {
      logServerWarning("Season compare Claude request failed", {
        classification: claudeClassification,
        error,
      })
      return buildClaudeRouteErrorResponse(claudeClassification, rateHeaders)
    }
    logServerError("Season compare error", error)
    return Response.json(
      { success: false, error: sanitizeRouteError(error, "Failed to generate season comparison") },
      { status: 500, headers: rateHeaders },
    )
  }
}
