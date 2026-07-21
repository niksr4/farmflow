import "server-only"

import { DEFAULT_DAILY_DIGEST_EMAIL_FROM, EMAIL_BCC_MONITORING } from "@/lib/email-addresses"
// This agent runs from cron across every tenant, not inside a per-request handler, so it uses
// the RLS-bypassing owner connection rather than app_runtime, which requires a per-request
// app.tenant_id session context this code never has.
import { adminSql as sql } from "@/lib/server/db"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError, logServerWarning } from "@/lib/server/safe-logging"
import { DEFAULT_WEATHER_QUERY } from "@/lib/weather-config"
import { buildWeatherFarmAdvice } from "@/lib/coffee-agronomy"
import { summarizeForecastWindow, deriveIrrigationAdvice, WEATHER_FORECAST_DAYS } from "@/lib/weather-guidance"
import {
  fetchTenantOwnersWithVerifiedEmail,
  fetchRecentRainfallSummary,
  type TenantDigestRow,
  type RecentRainfallSummary,
} from "@/lib/server/agents/digest-shared"

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

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const istDateString = (date: Date): string => new Date(date.getTime() + IST_OFFSET_MS).toISOString().split("T")[0]

const htmlEscape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// ---------------------------------------------------------------------------
// Yesterday's activity
// ---------------------------------------------------------------------------

type YesterdayActivity = {
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

async function fetchYesterdayActivity(tenantId: string, yesterdayDate: string): Promise<YesterdayActivity> {
  const empty: YesterdayActivity = {
    processingKg: 0, processingDays: 0, laborEntries: 0, laborCost: 0, laborWorkers: 0,
    expenseTotal: 0, expenseEntries: 0, salesRevenue: 0, dispatchBags: 0, rainfallInches: 0, pickingEntries: 0,
  }
  if (!sql) return empty

  try {
    const result = await sql.query(`
      SELECT
        (SELECT COALESCE(SUM(crop_today), 0) FROM processing_records
          WHERE tenant_id = $1 AND process_date = $2::date) AS proc_kg,
        (SELECT COUNT(*) FROM processing_records
          WHERE tenant_id = $1 AND process_date = $2::date) AS proc_days,
        (SELECT COUNT(*) FROM labor_transactions
          WHERE tenant_id = $1 AND (deployment_date AT TIME ZONE 'Asia/Kolkata')::date = $2::date) AS labor_entries,
        (SELECT COALESCE(SUM(total_cost), 0) FROM labor_transactions
          WHERE tenant_id = $1 AND (deployment_date AT TIME ZONE 'Asia/Kolkata')::date = $2::date) AS labor_cost,
        (SELECT COALESCE(SUM(hf_laborers + outside_laborers), 0) FROM labor_transactions
          WHERE tenant_id = $1 AND (deployment_date AT TIME ZONE 'Asia/Kolkata')::date = $2::date) AS labor_workers,
        (SELECT COALESCE(SUM(total_amount), 0) FROM expense_transactions
          WHERE tenant_id = $1 AND (entry_date AT TIME ZONE 'Asia/Kolkata')::date = $2::date) AS expense_total,
        (SELECT COUNT(*) FROM expense_transactions
          WHERE tenant_id = $1 AND (entry_date AT TIME ZONE 'Asia/Kolkata')::date = $2::date) AS expense_entries,
        (SELECT COALESCE(SUM(revenue), 0) FROM sales_records
          WHERE tenant_id = $1 AND sale_date = $2::date) AS sales_revenue,
        (SELECT COALESCE(SUM(bags_dispatched), 0) FROM dispatch_records
          WHERE tenant_id = $1 AND dispatch_date = $2::date) AS dispatch_bags,
        (SELECT COALESCE(SUM(inches + cents::numeric / 100), 0) FROM rainfall_records
          WHERE tenant_id = $1 AND record_date = $2::date) AS rainfall_inches,
        (SELECT COUNT(*) FROM picking_records
          WHERE tenant_id = $1 AND pick_date = $2::date) AS picking_entries
    `, [tenantId, yesterdayDate])

    const row = (Array.isArray(result) ? result[0] : (result as any)?.rows?.[0]) ?? {}
    return {
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

function buildYesterdaySection(a: YesterdayActivity, dateLabel: string): string {
  const lines: string[] = [`## Yesterday (${dateLabel})`]
  if (a.processingKg > 0) lines.push(`- Cherry processed: ${a.processingKg.toFixed(1)} kg`)
  if (a.pickingEntries > 0) lines.push(`- Picking entries recorded: ${a.pickingEntries}`)
  if (a.laborEntries > 0) lines.push(`- Labor deployments: ${a.laborEntries} entries, ${a.laborWorkers} worker-days, ₹${a.laborCost.toLocaleString("en-IN")} cost`)
  if (a.expenseEntries > 0) lines.push(`- Other expenses: ₹${a.expenseTotal.toLocaleString("en-IN")} across ${a.expenseEntries} entries`)
  if (a.salesRevenue > 0) lines.push(`- Sales revenue: ₹${a.salesRevenue.toLocaleString("en-IN")}`)
  if (a.dispatchBags > 0) lines.push(`- Bags dispatched: ${a.dispatchBags.toFixed(1)}`)
  if (a.rainfallInches > 0) lines.push(`- Rainfall recorded: ${a.rainfallInches.toFixed(2)} inches`)
  if (lines.length === 1) lines.push("- No activity recorded yesterday.")
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Today's weather
// ---------------------------------------------------------------------------

type TodayWeather = {
  locationLabel: string | null
  current: { tempC: number; conditionText: string; humidityPct: number } | null
  today: { minTempC: number; maxTempC: number; totalPrecipMm: number; chanceOfRainPct: number } | null
  next3DaysPrecipMm: number[]
  next3DaysChancePct: number[]
}

async function fetchTodayWeather(locationQuery: string): Promise<TodayWeather | null> {
  const apiKey = String(process.env.WEATHERAPI_API_KEY || "").trim()
  if (!apiKey) return null

  try {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(locationQuery)}&days=${WEATHER_FORECAST_DAYS}&aqi=no&alerts=no`
    const res = await fetchWithTimeout(url, { timeoutMs: 8_000 })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (!data) return null

    const location = data?.location
    const forecastDays: Array<{ day?: any }> = data?.forecast?.forecastday ?? []
    const todayDay = forecastDays[0]?.day
    const current = data?.current

    return {
      locationLabel: location?.name ? `${location.name}${location.region ? `, ${location.region}` : ""}` : null,
      current: current
        ? {
            tempC: Number(current.temp_c) || 0,
            conditionText: String(current.condition?.text || "").trim(),
            humidityPct: Number(current.humidity) || 0,
          }
        : null,
      today: todayDay
        ? {
            minTempC: Number(todayDay.mintemp_c) || 0,
            maxTempC: Number(todayDay.maxtemp_c) || 0,
            totalPrecipMm: Number(todayDay.totalprecip_mm) || 0,
            chanceOfRainPct: Number(todayDay.daily_chance_of_rain) || 0,
          }
        : null,
      next3DaysPrecipMm: forecastDays.map((d) => Number(d?.day?.totalprecip_mm) || 0),
      next3DaysChancePct: forecastDays.map((d) => Number(d?.day?.daily_chance_of_rain) || 0),
    }
  } catch {
    return null
  }
}

function buildTodayWeatherSection(weather: TodayWeather | null): string {
  const lines: string[] = ["## Today's Weather"]
  if (!weather) {
    lines.push("- Weather forecast unavailable (no API key or estate location configured).")
    return lines.join("\n")
  }
  if (weather.locationLabel) lines.push(`- Location: ${weather.locationLabel}`)
  if (weather.current) {
    lines.push(`- Right now: ${weather.current.tempC.toFixed(1)}°C${weather.current.conditionText ? `, ${weather.current.conditionText}` : ""}, ${weather.current.humidityPct}% humidity`)
  }
  if (weather.today) {
    lines.push(`- Today's range: ${weather.today.minTempC.toFixed(1)}–${weather.today.maxTempC.toFixed(1)}°C`)
    lines.push(`- Rain chance today: ${weather.today.chanceOfRainPct}%, ${(weather.today.totalPrecipMm / 25.4).toFixed(2)} in expected`)
  }
  if (lines.length === 1) lines.push("- Weather data unavailable today.")
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Advice — rules-based, no LLM call
// ---------------------------------------------------------------------------

function buildAdviceSection(params: { rainfall: RecentRainfallSummary; weather: TodayWeather | null }): string {
  const lines: string[] = ["## Advice for Today"]
  if (!params.weather) {
    lines.push("- No advice available today (weather data missing).")
    return lines.join("\n")
  }

  const forecastInputs = params.weather.next3DaysPrecipMm.map((mm, i) => ({
    precipitationMm: mm,
    chanceOfRainPct: params.weather!.next3DaysChancePct[i],
  }))
  const { next3DaysRainInches, rainyDaysNext3, maxChanceNext3 } = summarizeForecastWindow(forecastInputs)

  const irrigation = deriveIrrigationAdvice({
    next3DaysRainInches,
    rainyDaysNext3,
    maxChanceNext3,
    last7DaysRainInches: params.rainfall.last7DaysInches,
    recentDailyAverageInches: params.rainfall.recentDailyAverageInches,
    loggedDaysInLast30: params.rainfall.loggedDaysInLast30,
  })
  lines.push(`- Irrigation: ${irrigation.title} — ${irrigation.reason} ${irrigation.recommendation}`)

  const farmAdvice = buildWeatherFarmAdvice({
    last7DaysRainInches: params.rainfall.last7DaysInches,
    next3DaysForecastMm: params.weather.next3DaysPrecipMm,
    next3DaysChancePct: params.weather.next3DaysChancePct,
    monthIndex: new Date().getMonth(),
  })
  if (farmAdvice) {
    lines.push(`- ${farmAdvice.title}: ${farmAdvice.body}`)
  }

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Email rendering + sending
// ---------------------------------------------------------------------------

function buildDailyDigestBodyHtml(sections: string[]): string {
  return sections
    .map((section) =>
      section
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          if (line.startsWith("## ")) {
            return `<p style="margin:20px 0 4px;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">${htmlEscape(line.slice(3))}</p>`
          }
          if (line.startsWith("- ")) {
            return `<p style="margin:4px 0 4px 16px;font-size:14px;line-height:1.5;color:#374151;">· ${htmlEscape(line.slice(2))}</p>`
          }
          return `<p style="margin:6px 0;font-size:14px;line-height:1.6;color:#374151;">${htmlEscape(line)}</p>`
        })
        .join("\n"),
    )
    .join("\n")
}

function buildDailyDigestHtml(ownerName: string, tenantName: string, sections: string[], dateLabel: string): string {
  const bodyHtml = buildDailyDigestBodyHtml(sections)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="background:#78350f;border-radius:12px 12px 0 0;padding:24px 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#fcd34d;">Daily Brief</p>
          <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#f9fafb;">${htmlEscape(tenantName)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#fde68a;">${htmlEscape(dateLabel)}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:28px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Good morning, ${htmlEscape(ownerName)} — here's your FarmFlow daily brief.</p>
          ${bodyHtml}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f3f4f6;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;padding:16px 32px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">Powered by FarmFlow — your estate, always in view.</p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because you're the estate owner on FarmFlow. Reply to unsubscribe.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendDailyDigestEmail(tenant: TenantDigestRow, sections: string[], dateLabel: string): Promise<boolean> {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const from = String(process.env.DAILY_DIGEST_EMAIL_FROM || DEFAULT_DAILY_DIGEST_EMAIL_FROM).trim()
  if (!resendKey || !from) return false

  const subject = `Your FarmFlow Daily Brief — ${tenant.tenantName} — ${dateLabel}`
  const plainSections = sections.join("\n\n")
  const text = `Good morning, ${tenant.ownerName},\n\nHere is your FarmFlow daily brief for ${dateLabel}.\n\n${plainSections}\n\nPowered by FarmFlow — your estate, always in view.`
  const html = buildDailyDigestHtml(tenant.ownerName, tenant.tenantName, sections, dateLabel)

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
      logServerWarning(`Daily digest email failed for ${tenant.ownerEmail}`, { status: response.status, body })
      return false
    }

    return true
  } catch (error) {
    logServerWarning(`Daily digest email request failed for ${tenant.ownerEmail}`, error)
    return false
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runDailyDigestAgent(input?: {
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

  let runId: string | null = null
  if (sql) {
    try {
      const runRow = await sql.query(
        `INSERT INTO agent_runs (agent_name, trigger_source, status, tenant_scope)
         VALUES ('daily-digest', $1, 'running', $2) RETURNING id`,
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

  const now = new Date()
  const todayDate = istDateString(now)
  const yesterdayDate = istDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const dateLabel = new Date(`${todayDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })
  const yesterdayLabel = new Date(`${yesterdayDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })

  // Small batches — no Claude calls here, so the bottleneck is just Resend/WeatherAPI concurrency.
  const BATCH_SIZE = 3
  const results: DigestResult[] = []

  for (let i = 0; i < tenants.length; i += BATCH_SIZE) {
    const batch = tenants.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.allSettled(
      batch.map(async (tenant): Promise<DigestResult> => {
        try {
          const locationQuery = tenant.weatherLocationQuery ?? DEFAULT_WEATHER_QUERY
          const [activity, rainfall, weather] = await Promise.all([
            fetchYesterdayActivity(tenant.tenantId, yesterdayDate),
            fetchRecentRainfallSummary(tenant.tenantId),
            fetchTodayWeather(locationQuery),
          ])

          const sections = [
            buildTodayWeatherSection(weather),
            buildAdviceSection({ rainfall, weather }),
            buildYesterdaySection(activity, yesterdayLabel),
          ]

          if (dryRun) {
            return { tenantId: tenant.tenantId, tenantName: tenant.tenantName, ownerEmail: tenant.ownerEmail, status: "skipped", reason: "dry-run" }
          }

          const sent = await sendDailyDigestEmail(tenant, sections, dateLabel)
          return {
            tenantId: tenant.tenantId,
            tenantName: tenant.tenantName,
            ownerEmail: tenant.ownerEmail,
            status: sent ? "sent" : "failed",
            reason: sent ? undefined : "Resend delivery failed",
          }
        } catch (error: any) {
          logServerError(`Daily digest generation failed for tenant ${tenant.tenantId}`, error)
          return {
            tenantId: tenant.tenantId,
            tenantName: tenant.tenantName,
            ownerEmail: tenant.ownerEmail,
            status: "failed",
            reason: String(error?.message || error || "unknown error"),
          }
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
