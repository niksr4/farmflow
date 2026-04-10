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

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const [curr, prev] = await Promise.all([
      fetchSeasonAggregates(tenantContext, currentFY.startDate, currentFY.endDate),
      fetchSeasonAggregates(tenantContext, prevFY.startDate, prevFY.endDate),
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

    const dataSummary = `
Season Comparison: ${prevFY.label} vs ${currentFY.label}

${prevFY.label} (completed):
- Pulping output: ${prev.pulpingKg.toLocaleString()} KG
- Dispatch received: ${prev.dispatchBags.toLocaleString()} bags
- Sales volume: ${prev.salesKg.toLocaleString()} KG | Revenue: ₹${prev.salesRevenue.toLocaleString()}
- Labor cost: ₹${prev.laborCost.toLocaleString()} | Other expenses: ₹${prev.expenseCost.toLocaleString()}

${currentFY.label} (in progress):
- Pulping output: ${curr.pulpingKg.toLocaleString()} KG  (${pctChange(curr.pulpingKg, prev.pulpingKg)} vs last season)
- Dispatch received: ${curr.dispatchBags.toLocaleString()} bags  (${pctChange(curr.dispatchBags, prev.dispatchBags)} vs last season)
- Sales volume: ${curr.salesKg.toLocaleString()} KG | Revenue: ₹${curr.salesRevenue.toLocaleString()}  (${pctChange(curr.salesRevenue, prev.salesRevenue)} vs last season)
- Labor cost: ₹${curr.laborCost.toLocaleString()} | Other expenses: ₹${curr.expenseCost.toLocaleString()}
    `.trim()

    const narrative =
      (
        await callAI({
          model: CLAUDE_HAIKU,
          max_tokens: 400,
          temperature: 0.2,
          system:
            "You are FarmFlow Season Analyst. Write a concise 2–3 sentence year-on-year comparison for an estate manager. Ground every observation in the numbers provided. Use INR (₹) and KG. Be specific — name the metric and the percentage. No markdown, no bullet points, plain prose only.",
          messages: [
            {
              role: "user",
              content: `${dataSummary}\n\nWrite a 2–3 sentence YoY season summary highlighting the most important changes.`,
            },
          ],
        })
      ).trim() || null

    return Response.json(
      {
        success: true,
        narrative,
        currentFY: currentFY.label,
        prevFY: prevFY.label,
        metrics: { curr, prev },
      },
      { headers: rateHeaders },
    )
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
