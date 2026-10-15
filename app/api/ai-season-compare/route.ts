import { cookies } from "next/headers"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { todayIso } from "@/lib/date-utils"
import { buildClaudeRouteErrorResponse, classifyClaudeRouteError } from "@/lib/server/claude-errors"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { logServerError, logServerWarning } from "@/lib/server/safe-logging"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { aggregate, attemptRead, failedReads } from "@/lib/server/incomplete-read"
import { CLAUDE_HAIKU } from "@/lib/server/claude"
import { callAI, isAIConfigured } from "@/lib/server/ai-provider"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { readResponseCache, writeResponseCache } from "@/lib/server/response-cache"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * ⚠ EVERY FIGURE IS NULLABLE, AND null IS NOT 0.
 *
 * These aggregates each used to end in `.catch(() => [])`, so a failed query arrived as
 * `Number(undefined) || 0`. The zero then went into the prompt as "Labour cost: ₹0" and Haiku wrote,
 * accurately quoting what it was given, that costs had collapsed year on year -- and the narrative
 * was cached for four hours. A language model cannot tell a measured zero from a missing one, so it
 * must never be handed one. See lib/server/incomplete-read.ts.
 */
type SeasonMetrics = {
  pulpingKg: number | null
  dispatchBags: number | null
  salesKg: number | null
  salesRevenue: number | null
  laborCost: number | null
  expenseCost: number | null
}

/** The metrics, plus the names of whichever reads did not come back. */
type SeasonReading = { metrics: SeasonMetrics; unavailable: string[] }

async function fetchSeasonAggregates(
  tenantContext: ReturnType<typeof normalizeTenantContext>,
  startDate: string,
  endDate: string,
  activeEstate: string | null,
  window: string,
): Promise<SeasonReading> {
  if (!sql) {
    return {
      metrics: { pulpingKg: null, dispatchBags: null, salesKg: null, salesRevenue: null, laborCost: null, expenseCost: null },
      unavailable: ["everything (no database configured)"],
    }
  }

  const [laborSupportsLocation, expenseSupportsLocation] = await Promise.all([
    sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'labour_cost' AND column_name = 'location_id'
      LIMIT 1
    `.then((rows) => Array.isArray(rows) && rows.length > 0),
    sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expense_transactions' AND column_name = 'location_id'
      LIMIT 1
    `.then((rows) => Array.isArray(rows) && rows.length > 0),
  ])
  // A tenant owner running multiple estates needs this comparison to read as each estate's own
  // profitability center, same as everywhere else the estate filter is wired in. A NULL
  // location_id is never "the other estate's" -- it must still count regardless of which
  // estate is active.
  const estateClause = activeEstate
    ? sql` AND (location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}))`
    : sql``
  const laborEstateClause = laborSupportsLocation ? estateClause : sql``
  const expenseEstateClause = expenseSupportsLocation ? estateClause : sql``

  const [processing, dispatch, sales, labor, expenses] = await Promise.all([
    attemptRead(`${window} pulping`, runTenantQuery(sql, tenantContext, sql`
      SELECT COALESCE(SUM(crop_today), 0) AS total_kg
      FROM processing_records
      WHERE process_date >= ${startDate}::date AND process_date <= ${endDate}::date
        AND tenant_id = ${tenantContext.tenantId}
        ${estateClause}
    `)),
    attemptRead(`${window} dispatch`, runTenantQuery(sql, tenantContext, sql`
      SELECT COALESCE(SUM(bags_dispatched), 0) AS total_bags
      FROM dispatch_records
      WHERE dispatch_date >= ${startDate} AND dispatch_date <= ${endDate}
        AND tenant_id = ${tenantContext.tenantId}
        ${estateClause}
    `)),
    attemptRead(`${window} sales`, runTenantQuery(sql, tenantContext, sql`
      SELECT COALESCE(SUM(kgs), 0) AS total_kgs, COALESCE(SUM(revenue), 0) AS total_revenue
      -- booked_revenue: see scripts/121. A year-on-year comparison built on sales_records
      -- alone silently drops whichever years had pepper sales.
      FROM booked_revenue
      WHERE sale_date >= ${startDate} AND sale_date <= ${endDate}
        AND tenant_id = ${tenantContext.tenantId}
        ${estateClause}
    `)),
    attemptRead(`${window} labour`, runTenantQuery(sql, tenantContext, sql`
      SELECT COALESCE(SUM(total_cost), 0) AS total_cost
      FROM labour_cost
      WHERE work_date >= ${startDate} AND work_date <= ${endDate}
        AND tenant_id = ${tenantContext.tenantId}
        ${laborEstateClause}
    `)),
    attemptRead(`${window} expenses`, runTenantQuery(sql, tenantContext, sql`
      SELECT COALESCE(SUM(total_amount), 0) AS total_amount
      FROM expense_transactions
      WHERE entry_date >= ${startDate} AND entry_date <= ${endDate}
        AND tenant_id = ${tenantContext.tenantId}
        ${expenseEstateClause}
    `)),
  ])

  return {
    metrics: {
      pulpingKg: aggregate(processing, "total_kg"),
      dispatchBags: aggregate(dispatch, "total_bags"),
      salesKg: aggregate(sales, "total_kgs"),
      salesRevenue: aggregate(sales, "total_revenue"),
      laborCost: aggregate(labor, "total_cost"),
      expenseCost: aggregate(expenses, "total_amount"),
    },
    unavailable: failedReads({
      "pulping output": processing,
      "dispatch": dispatch,
      "sales": sales,
      "labour cost": labor,
      "other expenses": expenses,
    }),
  }
}

/**
 * Unknown in, unknown out. Returning "—" for a null is what keeps an unreadable figure from being
 * described as a change of some definite size.
 */
function pctChange(curr: number | null, prev: number | null): string {
  if (curr === null || prev === null) return "not comparable"
  if (prev === 0) return curr > 0 ? "+∞%" : "—"
  const pct = ((curr - prev) / prev) * 100
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`
}

export async function GET(request: Request) {
  let rateHeaders: Record<string, string> = {}
  try {
    const sessionUser = await requireModuleAccess("ai-analysis")
    const { searchParams } = new URL(request.url)
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)

    // Cache key must include the active estate -- otherwise whichever estate loads this first
    // "poisons" the shared 4-hour cache entry for every other estate/scope=all view.
    const cacheKey = `ai-season-compare:${sessionUser.tenantId}:${activeEstate || "all"}`
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
    // IST calendar date (not UTC): getCurrentFiscalYear() above is IST, and between 00:00 and
    // 05:30 IST the UTC date is still yesterday, which on 1 April falls before the FY start.
    const todayStr = todayIso()
    const [todayYear, todayMonth, todayDay] = todayStr.split("-").map(Number)
    const prevYearEquivalentStr = new Date(Date.UTC(todayYear - 1, todayMonth - 1, todayDay)).toISOString().slice(0, 10)
    // Clamp prev-year equivalent to within the previous FY bounds
    const prevEndDate = prevYearEquivalentStr > prevFY.endDate ? prevFY.endDate : prevYearEquivalentStr

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const [currReading, prevReading] = await Promise.all([
      fetchSeasonAggregates(tenantContext, currentFY.startDate, todayStr, activeEstate, currentFY.label),
      fetchSeasonAggregates(tenantContext, prevFY.startDate, prevEndDate, activeEstate, prevFY.label),
    ])
    const curr = currReading.metrics
    const prev = prevReading.metrics
    const unavailable = [...new Set([...currReading.unavailable, ...prevReading.unavailable])].sort()

    /**
     * ⚠ "NOTHING TO COMPARE" AND "COULD NOT READ IT" ARE DIFFERENT ANSWERS.
     *
     * This check used to be `curr.pulpingKg > 0 || ...` over figures that were 0 on failure, so a
     * database problem reported itself as `insufficient_data` -- telling an estate with ten years of
     * records that it had none yet. Volume now counts only where it was actually read.
     */
    const volumeRead = (m: SeasonMetrics) =>
      m.pulpingKg !== null || m.salesKg !== null || m.dispatchBags !== null
    const hasData = (m: SeasonMetrics) =>
      (m.pulpingKg ?? 0) > 0 || (m.salesKg ?? 0) > 0 || (m.dispatchBags ?? 0) > 0

    if (!volumeRead(curr) && !volumeRead(prev)) {
      // Not one volume figure came back from either window. That is a fault, and saying "no data"
      // would be a guess dressed as a finding.
      logServerError("Season compare could not read any volume figure", new Error(unavailable.join(", ")))
      return Response.json(
        { success: false, error: "Could not read this season's figures. Try again in a moment." },
        { status: 503, headers: rateHeaders },
      )
    }

    if (!hasData(curr) && !hasData(prev) && unavailable.length === 0) {
      return Response.json(
        { success: true, narrative: null, reason: "insufficient_data" },
        { headers: rateHeaders },
      )
    }

    const periodLabel = `${currentFY.startDate} to ${todayStr}`
    const prevPeriodLabel = `${prevFY.startDate} to ${prevEndDate}`

    /**
     * A METRIC GOES IN THE PROMPT ONLY IF BOTH WINDOWS WERE READ.
     *
     * A comparison needs two figures. The old prompt printed one real number against a fabricated
     * zero and asked for a year-on-year reading, which is how "labour cost down 100%" got written
     * about an estate whose labour query had simply timed out.
     */
    const COMPARABLE = [
      { key: "pulpingKg", label: "Pulping output", unit: "kg" },
      { key: "dispatchBags", label: "Dispatch received", unit: "bags" },
      { key: "salesKg", label: "Sales volume", unit: "kg" },
      { key: "salesRevenue", label: "Revenue", unit: "inr" },
      { key: "laborCost", label: "Labour cost", unit: "inr" },
      { key: "expenseCost", label: "Other expenses", unit: "inr" },
    ] as const

    const shown = COMPARABLE.filter((m) => curr[m.key] !== null && prev[m.key] !== null)
    const omitted = COMPARABLE.filter((m) => curr[m.key] === null || prev[m.key] === null)

    if (!shown.length) {
      logServerError("Season compare had no metric readable in both windows", new Error(unavailable.join(", ")))
      return Response.json(
        { success: false, error: "Could not read this season's figures. Try again in a moment." },
        { status: 503, headers: rateHeaders },
      )
    }

    const value = (n: number, unit: string) =>
      unit === "inr" ? `₹${n.toLocaleString()}` : `${n.toLocaleString()} ${unit === "kg" ? "KG" : unit}`

    const dataSummary = `
Same-period season comparison (both windows cover the same elapsed days into the fiscal year):

${prevFY.label} — ${prevPeriodLabel}:
${shown.map((m) => `- ${m.label}: ${value(prev[m.key] as number, m.unit)}`).join("\n")}

${currentFY.label} — ${periodLabel} (in progress, same point in season):
${shown
  .map(
    (m) =>
      `- ${m.label}: ${value(curr[m.key] as number, m.unit)}  (${pctChange(curr[m.key], prev[m.key])} vs same point last season)`,
  )
  .join("\n")}
${
  omitted.length
    ? `\nNOT MEASURED for this comparison: ${omitted.map((m) => m.label).join(", ")}. These figures could not be read. Do not mention them, do not treat them as zero, and do not estimate them.`
    : ""
}
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
      // So the caller can say the comparison is incomplete rather than presenting it as whole.
      partial: unavailable.length > 0,
      unavailable,
    }

    /**
     * ⚠ A PARTIAL ANSWER IS NEVER CACHED. The cache holds for four hours, so caching one would turn
     * a few seconds of database trouble into four hours of an estate reading a comparison with a
     * metric silently missing from it -- long after the fault had cleared. A transient failure
     * should cost a retry, not a shelf life.
     */
    if (!comparePayload.partial) {
      await writeResponseCache(cacheKey, comparePayload)
    }
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
