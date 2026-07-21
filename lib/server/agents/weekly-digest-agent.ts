import "server-only"

import { DEFAULT_ALERT_EMAIL_FROM, DEFAULT_DIGEST_EMAIL_FROM, EMAIL_BCC_MONITORING } from "@/lib/email-addresses"
// This agent runs from cron across every tenant, not inside a per-request handler, so it uses
// the RLS-bypassing owner connection rather than app_runtime, which requires a per-request
// app.tenant_id session context this code never has.
import { adminSql as sql } from "@/lib/server/db"
import { buildTenantAiDataSummary } from "@/lib/server/ai-analysis"
import { getClaudeClient, isClaudeConfigured, extractClaudeText, CLAUDE_SONNET } from "@/lib/server/claude"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError, logServerWarning } from "@/lib/server/safe-logging"
import { getCropLabel, getCropVarietiesLabel } from "@/lib/tenant-estate-profile"
import { buildEstateCalendarContext } from "@/lib/coffee-estate-calendar"
import { buildAgronomyContext } from "@/lib/coffee-agronomy"
import { upsertWeeklyMetrics, fetchHistoricalMetrics, buildHistoricalBaselineContext } from "@/lib/server/tenant-weekly-metrics"
import { summarizeForecastWindow, deriveIrrigationAdvice, deriveWeatherAnomalySignal, WEATHER_FORECAST_DAYS } from "@/lib/weather-guidance"
import { DEFAULT_WEATHER_QUERY } from "@/lib/weather-config"
import { getCoffeePriceAnalysis, estimateSellableStock, buildMarketTimingSection } from "@/lib/server/coffee-prices"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { createDigestFeedbackLinks, type DigestFeedbackLinks } from "@/lib/server/digest-feedback"
import { fetchTenantOwnersWithVerifiedEmail, fetchRecentRainfallSummary, type TenantDigestRow } from "@/lib/server/agents/digest-shared"

type DigestResult = {
  tenantId: string
  tenantName: string
  ownerEmail: string
  status: "sent" | "skipped" | "failed"
  reason?: string
}

const toRows = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  const candidate = (value as any)?.rows
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

type LastWeekActivity = {
  weekLabel: string   // e.g. "31 Mar – 6 Apr 2026"
  weekStart: string   // YYYY-MM-DD (ISO Monday)
  processingKg: number
  processingDays: number
  laborEntries: number
  laborCost: number
  laborWorkers: number
  expenseTotal: number
  expenseEntries: number
  salesRevenue: number
  dispatchBags: number
  rainfallInches: number
  pickingEntries: number
}

async function fetchLastWeekActivity(tenantId: string): Promise<LastWeekActivity> {
  // Last week = Mon 00:00 IST to Sun 23:59 IST
  // Cron runs Monday 02:00 UTC (07:30 IST), so "last week" is the 7 days just ended
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const lastMonday = new Date(now)
  lastMonday.setDate(now.getDate() - daysToLastMonday - 7)
  lastMonday.setHours(0, 0, 0, 0)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  lastSunday.setHours(23, 59, 59, 999)

  const fmt = (d: Date) => d.toISOString().split("T")[0]
  const startDate = fmt(lastMonday)
  const endDate = fmt(lastSunday)

  const weekLabel = `${lastMonday.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${lastSunday.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`

  const empty: LastWeekActivity = { weekLabel, weekStart: startDate, processingKg: 0, processingDays: 0, laborEntries: 0, laborCost: 0, laborWorkers: 0, expenseTotal: 0, expenseEntries: 0, salesRevenue: 0, dispatchBags: 0, rainfallInches: 0, pickingEntries: 0 }
  if (!sql) return empty

  try {
    const result = await sql.query(`
      SELECT
        (SELECT COALESCE(SUM(crop_today), 0) FROM processing_records
          WHERE tenant_id = $1 AND process_date BETWEEN $2 AND $3)  AS proc_kg,
        (SELECT COUNT(*) FROM processing_records
          WHERE tenant_id = $1 AND process_date BETWEEN $2 AND $3)  AS proc_days,
        (SELECT COUNT(*) FROM labor_transactions
          WHERE tenant_id = $1 AND deployment_date BETWEEN $2 AND $3) AS labor_entries,
        (SELECT COALESCE(SUM(total_cost), 0) FROM labor_transactions
          WHERE tenant_id = $1 AND deployment_date BETWEEN $2 AND $3) AS labor_cost,
        (SELECT COALESCE(SUM(hf_laborers + outside_laborers), 0) FROM labor_transactions
          WHERE tenant_id = $1 AND deployment_date BETWEEN $2 AND $3) AS labor_workers,
        (SELECT COALESCE(SUM(total_amount), 0) FROM expense_transactions
          WHERE tenant_id = $1 AND entry_date BETWEEN $2 AND $3)    AS expense_total,
        (SELECT COUNT(*) FROM expense_transactions
          WHERE tenant_id = $1 AND entry_date BETWEEN $2 AND $3)    AS expense_entries,
        (SELECT COALESCE(SUM(revenue), 0) FROM sales_records
          WHERE tenant_id = $1 AND sale_date BETWEEN $2 AND $3)     AS sales_revenue,
        (SELECT COALESCE(SUM(bags_dispatched), 0) FROM dispatch_records
          WHERE tenant_id = $1 AND dispatch_date BETWEEN $2 AND $3) AS dispatch_bags,
        (SELECT COALESCE(SUM(inches + cents::numeric / 100), 0) FROM rainfall_records
          WHERE tenant_id = $1 AND record_date BETWEEN $2 AND $3)   AS rainfall_inches,
        (SELECT COUNT(*) FROM picking_records
          WHERE tenant_id = $1 AND pick_date BETWEEN $2 AND $3)  AS picking_entries
    `, [tenantId, startDate, endDate])

    const row = (Array.isArray(result) ? result[0] : (result as any)?.rows?.[0]) ?? {}
    return {
      weekLabel,
      weekStart: startDate,
      processingKg: Number(row.proc_kg) || 0,
      processingDays: Number(row.proc_days) || 0,
      laborEntries: Number(row.labor_entries) || 0,
      laborCost: Number(row.labor_cost) || 0,
      laborWorkers: Number(row.labor_workers) || 0,
      expenseTotal: Number(row.expense_total) || 0,
      expenseEntries: Number(row.expense_entries) || 0,
      salesRevenue: Number(row.sales_revenue) || 0,
      dispatchBags: Number(row.dispatch_bags) || 0,
      rainfallInches: Number(row.rainfall_inches) || 0,
      pickingEntries: Number(row.picking_entries) || 0,
    }
  } catch {
    return empty
  }
}

function buildLastWeekSection(w: LastWeekActivity): string {
  const lines: string[] = [`## Last Week (${w.weekLabel})`]
  if (w.processingKg > 0) lines.push(`- Cherry processed: ${w.processingKg.toFixed(1)} kg over ${w.processingDays} day(s)`)
  if (w.pickingEntries > 0) lines.push(`- Picking entries recorded: ${w.pickingEntries}`)
  if (w.laborEntries > 0) lines.push(`- Labor deployments: ${w.laborEntries} entries, ${w.laborWorkers} worker-days, ₹${w.laborCost.toLocaleString("en-IN")} cost`)
  if (w.expenseEntries > 0) lines.push(`- Other expenses: ₹${w.expenseTotal.toLocaleString("en-IN")} across ${w.expenseEntries} entries`)
  if (w.salesRevenue > 0) lines.push(`- Sales revenue: ₹${w.salesRevenue.toLocaleString("en-IN")}`)
  if (w.dispatchBags > 0) lines.push(`- Bags dispatched: ${w.dispatchBags.toFixed(1)}`)
  if (w.rainfallInches > 0) lines.push(`- Rainfall recorded: ${w.rainfallInches.toFixed(2)} inches`)
  if (lines.length === 1) lines.push("- No activity recorded last week.")
  return lines.join("\n")
}

async function fetchWeatherForecast(locationQuery: string): Promise<string | null> {
  const apiKey = String(process.env.WEATHERAPI_API_KEY || "").trim()
  if (!apiKey) return null
  try {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(locationQuery)}&days=${WEATHER_FORECAST_DAYS}&aqi=no&alerts=no`
    const res = await fetchWithTimeout(url, { timeoutMs: 8_000 })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function buildWeatherContext(params: {
  locationQuery: string | null
  forecastJson: string | null
  rainfall: { last7DaysInches: number; last30DaysInches: number; loggedDaysInLast30: number; recentDailyAverageInches: number }
}): string {
  const lines: string[] = ["## Weather & Irrigation Context"]

  lines.push(`- Recorded rainfall last 7 days: ${params.rainfall.last7DaysInches.toFixed(2)} inches`)
  lines.push(`- Recorded rainfall last 30 days: ${params.rainfall.last30DaysInches.toFixed(2)} inches (${params.rainfall.loggedDaysInLast30} logged days)`)

  if (!params.forecastJson) {
    lines.push("- Live weather forecast: not available (no API key or location configured)")
    return lines.join("\n")
  }

  try {
    const data = JSON.parse(params.forecastJson)
    const location = data?.location
    const forecastDays: Array<{ day: { totalprecip_mm: number; daily_chance_of_rain: number }; date: string }> =
      data?.forecast?.forecastday ?? []

    if (location?.name) {
      lines.push(`- Forecast location: ${location.name}${location.region ? `, ${location.region}` : ""}`)
    }

    const forecastInputs = forecastDays.map((d) => ({
      precipitationMm: d.day?.totalprecip_mm ?? 0,
      chanceOfRainPct: d.day?.daily_chance_of_rain ?? 0,
    }))

    const { next3DaysRainInches, rainyDaysNext3, maxChanceNext3 } = summarizeForecastWindow(forecastInputs)

    forecastDays.slice(0, WEATHER_FORECAST_DAYS).forEach((d) => {
      const mm = d.day?.totalprecip_mm ?? 0
      const chance = d.day?.daily_chance_of_rain ?? 0
      lines.push(`- ${d.date}: ${(mm / 25.4).toFixed(2)} in forecast, ${chance}% rain chance`)
    })

    lines.push(`- 3-day total forecast: ${next3DaysRainInches.toFixed(2)} inches across ${rainyDaysNext3} rainy day(s), peak chance ${maxChanceNext3}%`)

    const anomaly = deriveWeatherAnomalySignal({
      next3DaysRainInches,
      recentDailyAverageInches: params.rainfall.recentDailyAverageInches,
    })
    lines.push(`- Forecast vs recent trend: ${anomaly}`)

    const irrigation = deriveIrrigationAdvice({
      next3DaysRainInches,
      rainyDaysNext3,
      maxChanceNext3,
      last7DaysRainInches: params.rainfall.last7DaysInches,
      recentDailyAverageInches: params.rainfall.recentDailyAverageInches,
      loggedDaysInLast30: params.rainfall.loggedDaysInLast30,
    })
    lines.push(`- Irrigation signal: ${irrigation.title} — ${irrigation.reason} ${irrigation.recommendation} (confidence: ${irrigation.confidence})`)
  } catch {
    lines.push("- Live weather forecast: could not parse response")
  }

  return lines.join("\n")
}

type SeasonCostBasis = {
  fyLabel: string
  totalCosts: number          // labour + expenses season-to-date
  outputKg: number            // dry_parch + dry_cherry produced
  costPerKgOutput: number     // totalCosts / outputKg (null when no output yet)
  maintenanceCostToDate: number // same as totalCosts — named for off-season context
  recentAvgSellPricePerKg: number | null  // weighted avg from last 6 months of sales
  lastSaleDate: string | null
  soldKg: number
}

async function fetchSeasonCostBasis(tenantId: string): Promise<SeasonCostBasis | null> {
  if (!sql) return null
  try {
    const fy = getCurrentFiscalYear()
    const start = fy.startDate
    const end = fy.endDate
    const fyLabel = fy.label

    const rows = await sql.query(`
      WITH fy AS (SELECT $2::date AS s, $3::date AS e)
      SELECT
        (SELECT COALESCE(SUM(total_cost),0) FROM labor_transactions
           WHERE tenant_id=$1 AND deployment_date BETWEEN (SELECT s FROM fy) AND (SELECT e FROM fy)) AS labour,
        (SELECT COALESCE(SUM(total_amount),0) FROM expense_transactions
           WHERE tenant_id=$1 AND entry_date BETWEEN (SELECT s FROM fy) AND (SELECT e FROM fy)) AS expenses,
        (SELECT COALESCE(SUM(dry_parch+dry_cherry),0) FROM processing_records
           WHERE tenant_id=$1 AND process_date BETWEEN (SELECT s FROM fy) AND (SELECT e FROM fy)) AS output_kg,
        (SELECT COALESCE(SUM(COALESCE(NULLIF(kgs,0),NULLIF(weight_kgs,0),bags_sold*50)),0)
           FROM sales_records WHERE tenant_id=$1 AND sale_date BETWEEN (SELECT s FROM fy) AND (SELECT e FROM fy)) AS sold_kg,
        (SELECT COALESCE(
           SUM(revenue) / NULLIF(SUM(COALESCE(NULLIF(kgs,0),NULLIF(weight_kgs,0),bags_sold*50)), 0)
         , NULL)
           FROM sales_records
           WHERE tenant_id=$1 AND sale_date >= NOW() - INTERVAL '6 months' AND revenue > 0) AS avg_sell_price,
        (SELECT MAX(sale_date)::text FROM sales_records WHERE tenant_id=$1) AS last_sale
    `, [tenantId, start, end])

    const toRows = (r: unknown): any[] => Array.isArray(r) ? r : (r as any)?.rows ?? []
    const row = toRows(rows)[0]
    if (!row) return null

    const totalCosts = Number(row.labour ?? 0) + Number(row.expenses ?? 0)
    const outputKg = Number(row.output_kg ?? 0)

    return {
      fyLabel,
      totalCosts,
      outputKg,
      costPerKgOutput: outputKg > 0 ? totalCosts / outputKg : 0,
      maintenanceCostToDate: totalCosts,
      recentAvgSellPricePerKg: row.avg_sell_price != null ? Number(row.avg_sell_price) : null,
      lastSaleDate: row.last_sale ?? null,
      soldKg: Number(row.sold_kg ?? 0),
    }
  } catch {
    return null
  }
}

function buildSeasonCostBasisSection(basis: SeasonCostBasis): string {
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`
  const lines: string[] = ["## Season Cost Basis"]

  lines.push(`- Fiscal year: ${basis.fyLabel}`)
  lines.push(`- Total costs logged so far (labour + expenses): ${fmt(basis.totalCosts)}`)

  if (basis.outputKg > 0) {
    lines.push(`- Dry output produced: ${Math.round(basis.outputKg).toLocaleString("en-IN")} kg`)
    lines.push(`- Cost per kg of output: ${fmt(basis.costPerKgOutput)}`)
    if (basis.recentAvgSellPricePerKg !== null) {
      const margin = basis.recentAvgSellPricePerKg - basis.costPerKgOutput
      lines.push(`- Recent average selling price (last 6 months): ${fmt(basis.recentAvgSellPricePerKg)}/kg`)
      lines.push(`- Implied margin per kg: ${fmt(margin)} (${margin >= 0 ? "profitable" : "BELOW COST — selling at a loss"})`)
      if (margin < 0) {
        lines.push(`- ⚠️ Recent sales are below the cost of production. Estate should not sell below ${fmt(basis.costPerKgOutput)}/kg.`)
      }
    } else {
      lines.push(`- No recent sales data to compare against production cost.`)
    }
  } else {
    // Off-season: no processing yet this fiscal year
    lines.push(`- No processing output recorded yet this fiscal year (off-season/maintenance phase).`)
    lines.push(`- These costs will form the base cost of this season's crop. Track them carefully.`)
    if (basis.recentAvgSellPricePerKg !== null) {
      lines.push(`- Last season's average selling price: ${fmt(basis.recentAvgSellPricePerKg)}/kg`)
      lines.push(`- Break-even context: if you repeat last season's output volume, you need to sell above ${fmt(basis.recentAvgSellPricePerKg)}/kg to cover costs already incurred.`)
    }
  }

  return lines.join("\n")
}

async function generateWeeklyDigestText(
  tenant: TenantDigestRow,
): Promise<{ text: string; weekStart: string; error?: undefined } | { text: null; weekStart?: undefined; error: string }> {
  try {
    const locationQuery = tenant.weatherLocationQuery ?? DEFAULT_WEATHER_QUERY
    const [{ dataSummary, fiscalYearLabel }, lastWeek, rainfall, forecastJson, coffeePrices, sellableStock, seasonCostBasis] = await Promise.all([
      buildTenantAiDataSummary({ tenantId: tenant.tenantId, role: "owner" }),
      fetchLastWeekActivity(tenant.tenantId),
      fetchRecentRainfallSummary(tenant.tenantId),
      fetchWeatherForecast(locationQuery),
      getCoffeePriceAnalysis(),
      estimateSellableStock(tenant.tenantId),
      fetchSeasonCostBasis(tenant.tenantId),
    ])

    // Persist this week's metrics, then load historical baselines in parallel
    await upsertWeeklyMetrics({
      tenantId: tenant.tenantId,
      weekStart: lastWeek.weekStart,
      cherryKg: lastWeek.processingKg,
      processingDays: lastWeek.processingDays,
      parchmentBags: lastWeek.dispatchBags,
      laborEntries: lastWeek.laborEntries,
      laborWorkerDays: lastWeek.laborWorkers,
      laborCost: lastWeek.laborCost,
      expenseTotal: lastWeek.expenseTotal,
      expenseEntries: lastWeek.expenseEntries,
      rainfallInches: lastWeek.rainfallInches,
      dispatchBags: lastWeek.dispatchBags,
      salesRevenue: lastWeek.salesRevenue,
      pickingEntries: lastWeek.pickingEntries,
    })
    const history = await fetchHistoricalMetrics(tenant.tenantId, 12)

    const cropLabel = getCropLabel({ cropFamily: tenant.cropFamily, primaryVarieties: tenant.primaryVarieties, acreageAcres: null, weatherLocationLabel: "", weatherLatitude: null, weatherLongitude: null })
    const varietiesLabel = getCropVarietiesLabel({ cropFamily: tenant.cropFamily, primaryVarieties: tenant.primaryVarieties, acreageAcres: null, weatherLocationLabel: "", weatherLatitude: null, weatherLongitude: null })
    const cropContext = varietiesLabel ? `${cropLabel} (${varietiesLabel})` : cropLabel
    const lastWeekSection = buildLastWeekSection(lastWeek)
    const historySection = buildHistoricalBaselineContext(history, {
      cherryKg: lastWeek.processingKg,
      processingDays: lastWeek.processingDays,
      parchmentBags: lastWeek.dispatchBags,
      laborEntries: lastWeek.laborEntries,
      laborWorkerDays: lastWeek.laborWorkers,
      laborCost: lastWeek.laborCost,
      expenseTotal: lastWeek.expenseTotal,
      expenseEntries: lastWeek.expenseEntries,
      rainfallInches: lastWeek.rainfallInches,
      dispatchBags: lastWeek.dispatchBags,
      salesRevenue: lastWeek.salesRevenue,
      pickingEntries: lastWeek.pickingEntries,
    })
    const calendarContext = buildEstateCalendarContext()
    const agronomyContext = buildAgronomyContext()
    const weatherContext = buildWeatherContext({ locationQuery, forecastJson, rainfall })
    const marketTimingSection = coffeePrices
      ? buildMarketTimingSection(coffeePrices, sellableStock)
      : null
    const costBasisSection = seasonCostBasis
      ? buildSeasonCostBasisSection(seasonCostBasis)
      : null

    const client = getClaudeClient()
    const digestSystemPrompt = `You are FarmFlow Weekly Digest, an expert agronomist and estate operations analyst for ${cropContext} estates in Karnataka/Kerala, India. You combine deep South Indian coffee cultivation knowledge with sharp financial judgement — your analysis is what a seasoned Coorg estate manager and their accountant would both respect.

${calendarContext}

${agronomyContext}

Rules:
- Use the season context above to interpret the data correctly. Low activity in the off-season is not a problem. Missing expected activities (e.g. no fertiliser in April) must be flagged.
- Ground every number strictly in the provided data. Never invent figures.
- When data is sparse or missing, say so plainly — but explain whether that is normal for this time of year.
- Use the correct crop terminology: refer to the primary crop as "${cropLabel}", use variety names where relevant.
- Use INR (₹) for currency and KG for weight unless the data suggests otherwise.
- Keep the tone warm, professional, and practical. Estate managers are busy.
- This is a weekly email digest — keep it under 550 words.
- Format with clear sections using plain text (no markdown headers, no asterisks). Use numbered lists for actions.`

    const response = await client.messages.create({
      model: CLAUDE_SONNET,
      max_tokens: 1600,
      temperature: 0.3,
      system: [{ type: "text", text: digestSystemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Generate a weekly operations digest for ${tenant.tenantName}.

${lastWeekSection}

${historySection}

## Season-to-Date Context (FY ${fiscalYearLabel})
${dataSummary}

${costBasisSection ? `\n${costBasisSection}\n` : ""}
${weatherContext}
${marketTimingSection ? `\n${marketTimingSection}` : ""}

Structure your digest in exactly ${marketTimingSection ? "five" : "four"} sections:

1. Last Week at a Glance — 2-3 sentences summarising what actually happened last week using exact figures from the data above.

2. Business Snapshot — three specific financial signals the owner needs to see:
   (a) Labour cost as a percentage of total spend this week. Flag if it is above 70% (typical healthy range is 50-65% for harvest season, lower off-season).
   (b) Season cost basis from the Season Cost Basis section above: state the cost per kg of output if production has started, OR the total maintenance cost accumulated so far if it is off-season. If cost per kg is above the recent selling price, flag this clearly — the estate is selling below cost.
   (c) Revenue-to-cost trend: is the estate earning more than it is spending YTD, or is there a deficit building? Be direct — if margins look thin or costs are running ahead of revenue, say so clearly.
   If data is insufficient for any signal, say "Insufficient data this week" rather than guessing.

3. Field Signal — combine the recorded rainfall, the 3-day forecast, and the irrigation signal from the Weather & Irrigation Context above into a single, specific observation. State whether to irrigate or hold, cite the forecast figures, and flag any anomaly vs the recent trend. If no forecast data is available, use the logged rainfall and seasonal norms only.
${marketTimingSection ? `
4. Market Timing — using the Market Timing data above, give one specific, direct sentence on whether current prices favour selling now or holding. Reference the signal (near-high / mid-range / near-low), the estimated unsold stock if available, and what the estate owner should ask their buyer this week. Never give financial advice — frame as market context only.

5. Three actions for this week` : `
4. Three actions for this week`} — one financial, two agronomic. The agronomic actions must factor in the forecast: if rain is coming, defer irrigation and focus on fertiliser timing; if it is dry, prioritise irrigation. Be specific: name the activity, timing, quantity or threshold where relevant. If data shows a gap vs benchmark, call it out directly in the action.

End with: "Powered by FarmFlow — your estate, always in view."`,
        },
      ],
    })

    const digestText = extractClaudeText(response).trim()
    if (!digestText) {
      const detail = `stop_reason=${response.stop_reason} blocks=${response.content.length} in=${response.usage?.input_tokens} out=${response.usage?.output_tokens}`
      logServerError(`Weekly digest generation empty for tenant ${tenant.tenantId}`, { detail })
      return { text: null, error: `Claude returned empty (${detail})` }
    }
    return { text: digestText, weekStart: lastWeek.weekStart }
  } catch (error: any) {
    const msg = String(error?.message || error || "unknown error")
    // Anthropic billing errors (402 / 400 with credit balance message) are config issues,
    // not code bugs — log as warning so they don't surface as unhandled Sentry errors.
    const isBillingError =
      error?.status === 402 ||
      (error?.status === 400 && typeof msg === "string" && msg.toLowerCase().includes("credit balance"))
    if (isBillingError) {
      logServerWarning(`Weekly digest skipped for tenant ${tenant.tenantId} — Anthropic billing: ${msg}`)
    } else {
      logServerError(`Weekly digest generation failed for tenant ${tenant.tenantId}`, error)
    }
    return { text: null, error: msg }
  }
}

function buildFeedbackHtml(feedbackLinks: DigestFeedbackLinks | null): string {
  if (!feedbackLinks) return ""
  return `
        <!-- Feedback -->
        <tr><td style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-top:1px solid #f3f4f6;padding:16px 32px;text-align:center;">
          <p style="margin:0 0 10px;font-size:13px;color:#6b7280;">Was this digest useful?</p>
          <a href="${feedbackLinks.up}" style="display:inline-block;margin:0 6px;padding:8px 18px;border-radius:8px;background:#ecfdf5;color:#047857;font-size:14px;font-weight:600;text-decoration:none;border:1px solid #a7f3d0;">👍 Yes</a>
          <a href="${feedbackLinks.down}" style="display:inline-block;margin:0 6px;padding:8px 18px;border-radius:8px;background:#fef2f2;color:#b91c1c;font-size:14px;font-weight:600;text-decoration:none;border:1px solid #fecaca;">👎 Not really</a>
        </td></tr>`
}

function buildDigestHtml(ownerName: string, tenantName: string, digestText: string, feedbackLinks: DigestFeedbackLinks | null): string {
  // Convert plain-text numbered sections to simple HTML paragraphs
  const lines = digestText.split("\n").filter((l) => l.trim().length > 0)
  const bodyHtml = lines
    .map((line) => {
      const trimmed = line.trim()
      // Numbered section header e.g. "1. This Week at a Glance"
      if (/^\d+\.\s+[A-Z]/.test(trimmed)) {
        return `<p style="margin:20px 0 4px;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">${trimmed}</p>`
      }
      // Bullet point
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        return `<p style="margin:4px 0 4px 16px;font-size:14px;color:#374151;">· ${trimmed.slice(2)}</p>`
      }
      // Powered-by footer line
      if (trimmed.startsWith("Powered by")) {
        return `<p style="margin-top:24px;font-size:12px;color:#9ca3af;">${trimmed}</p>`
      }
      return `<p style="margin:6px 0;font-size:14px;line-height:1.6;color:#374151;">${trimmed}</p>`
    })
    .join("\n")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="background:#052e16;border-radius:12px 12px 0 0;padding:24px 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#6ee7b7;">Weekly Digest</p>
          <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#f9fafb;">${tenantName}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:28px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Hi ${ownerName}, here is your weekly estate operations digest.</p>
          ${bodyHtml}
        </td></tr>
${buildFeedbackHtml(feedbackLinks)}

        <!-- Footer -->
        <tr><td style="background:#f3f4f6;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;padding:16px 32px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because you're the estate owner on FarmFlow. Reply to unsubscribe.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendDigestEmail(tenant: TenantDigestRow, digestText: string, feedbackLinks: DigestFeedbackLinks | null): Promise<boolean> {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const from = String(process.env.DIGEST_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || DEFAULT_DIGEST_EMAIL_FROM || DEFAULT_ALERT_EMAIL_FROM).trim()

  if (!resendKey || !from) return false

  const subject = `Your FarmFlow Weekly Digest — ${tenant.tenantName}`
  const greeting = `Hi ${tenant.ownerName},\n\nHere is your weekly estate operations digest.\n\n`
  const feedbackText = feedbackLinks
    ? `\n\nWas this digest useful?\nYes: ${feedbackLinks.up}\nNot really: ${feedbackLinks.down}`
    : ""
  const text = greeting + digestText + feedbackText
  const html = buildDigestHtml(tenant.ownerName, tenant.tenantName, digestText, feedbackLinks)

  try {
    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [tenant.ownerEmail],
        bcc: tenant.ownerEmail === EMAIL_BCC_MONITORING ? undefined : [EMAIL_BCC_MONITORING],
        subject,
        text,
        html,
      }),
      timeoutMs: 10_000,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      logServerWarning(`Weekly digest email failed for ${tenant.ownerEmail}`, { status: response.status, body })
      return false
    }

    return true
  } catch (error) {
    logServerWarning(`Weekly digest email request failed for ${tenant.ownerEmail}`, error)
    return false
  }
}

export async function runWeeklyDigestAgent(input?: {
  triggerSource?: string
  dryRun?: boolean
  tenantId?: string
}): Promise<{
  tenantsProcessed: number
  sent: number
  skipped: number
  failed: number
  results: DigestResult[]
  dryRun: boolean
}> {
  const dryRun = Boolean(input?.dryRun)

  if (!isClaudeConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured — weekly digest requires Claude")
  }

  let runId: string | null = null
  if (sql) {
    try {
      const runRow = await sql.query(
        `INSERT INTO agent_runs (agent_name, trigger_source, status, tenant_scope)
         VALUES ('weekly-digest', $1, 'running', $2) RETURNING id`,
        [input?.triggerSource || "manual", input?.tenantId ? "single" : "all"],
      )
      runId = toRows<any>(runRow)[0]?.id ?? null
    } catch {
      // non-critical — proceed without run tracking
    }
  }

  const allTenants = await fetchTenantOwnersWithVerifiedEmail()
  const tenants = input?.tenantId
    ? allTenants.filter((t) => t.tenantId === input.tenantId)
    : allTenants

  // Process tenants in parallel batches of 3 — avoids serial bottleneck with 5-10 tenants
  // while staying within Anthropic and Resend concurrency limits.
  const BATCH_SIZE = 3
  const results: DigestResult[] = []

  for (let i = 0; i < tenants.length; i += BATCH_SIZE) {
    const batch = tenants.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.allSettled(
      batch.map(async (tenant): Promise<DigestResult> => {
        const generated = await generateWeeklyDigestText(tenant)

        if (!generated.text) {
          return {
            tenantId: tenant.tenantId,
            tenantName: tenant.tenantName,
            ownerEmail: tenant.ownerEmail,
            status: "failed",
            reason: generated.error ?? "AI digest generation returned empty",
          }
        }

        if (dryRun) {
          return {
            tenantId: tenant.tenantId,
            tenantName: tenant.tenantName,
            ownerEmail: tenant.ownerEmail,
            status: "skipped",
            reason: "dry-run",
          }
        }

        const feedbackLinks = await createDigestFeedbackLinks(tenant.tenantId, generated.weekStart)
        const sent = await sendDigestEmail(tenant, generated.text, feedbackLinks)
        return {
          tenantId: tenant.tenantId,
          tenantName: tenant.tenantName,
          ownerEmail: tenant.ownerEmail,
          status: sent ? "sent" : "failed",
          reason: sent ? undefined : "Resend delivery failed",
        }
      }),
    )

    for (const settled of batchResults) {
      results.push(
        settled.status === "fulfilled"
          ? settled.value
          : { tenantId: "unknown", tenantName: "unknown", ownerEmail: "unknown", status: "failed", reason: String(settled.reason) },
      )
    }
  }

  const summary = {
    tenantsProcessed: tenants.length,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    dryRun,
  }

  if (runId && sql) {
    try {
      await sql.query(
        `UPDATE agent_runs SET status = $1, completed_at = NOW(), summary = $2 WHERE id = $3`,
        [summary.failed > 0 && summary.sent === 0 ? "failed" : "success", JSON.stringify(summary), runId],
      )
    } catch {
      // non-critical
    }
  }

  return { ...summary, results }
}
