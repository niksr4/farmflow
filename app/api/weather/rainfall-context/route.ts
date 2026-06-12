import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAnyModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError } from "@/lib/server/safe-logging"
import { parseJsonObject } from "@/lib/server/tenant-experience-db"
import { buildTenantWeatherQuery } from "@/lib/tenant-estate-profile"
import {
  buildWeatherOperationsGuidance,
  deriveDryingRisk,
  deriveIrrigationAdvice,
  deriveWeatherAnomalySignal,
  round2,
  summarizeForecastWindow,
  type ForecastGuidanceDay,
  WEATHER_FORECAST_DAYS,
} from "@/lib/weather-guidance"
import { DEFAULT_WEATHER_QUERY, normalizeWeatherLocationQuery } from "@/lib/weather-config"

type ForecastDay = {
  date: string
  day: {
    daily_chance_of_rain?: number
    totalprecip_mm?: number
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireAnyModuleAccess(["weather", "rainfall", "season", "yield-forecast"])
    const rateLimit = await checkRateLimit("weather", sessionUser.tenantId)
    const rateHeaders = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429, headers: rateHeaders })
    }

    const apiKey = process.env.WEATHERAPI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Weather service not configured. API key is missing." },
        { status: 500, headers: rateHeaders },
      )
    }

    const { searchParams } = new URL(request.url)
    const requestedRegion = (searchParams.get("region") || searchParams.get("q") || "").trim()
    const explicitLocationQuery = normalizeWeatherLocationQuery(requestedRegion)
    if (requestedRegion.length > 0 && !explicitLocationQuery) {
      return NextResponse.json({ success: false, error: "Region query too long." }, { status: 400, headers: rateHeaders })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    let locationQuery = explicitLocationQuery
    if (!locationQuery) {
      const profileRows = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT ui_preferences
          FROM tenants
          WHERE id = ${tenantContext.tenantId}
          LIMIT 1
        `,
      )
      const parsedUiPreferences = parseJsonObject(profileRows?.[0]?.ui_preferences, "tenant weather ui preferences")
      locationQuery = buildTenantWeatherQuery(parsedUiPreferences?.estateProfile) || DEFAULT_WEATHER_QUERY
    }

    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(
      locationQuery,
    )}&days=${WEATHER_FORECAST_DAYS}&aqi=no&alerts=no`

    const weatherResponse = await fetchWithTimeout(url, { next: { revalidate: 1800 }, timeoutMs: 8_000 })
    const weatherPayload = await weatherResponse.json().catch(() => ({}))
    if (!weatherResponse.ok) {
      const message = weatherPayload?.error?.message || weatherResponse.statusText
      return NextResponse.json({ success: false, error: `Failed to fetch forecast: ${message}` }, { status: weatherResponse.status, headers: rateHeaders })
    }

    const forecastDays: ForecastDay[] = Array.isArray(weatherPayload?.forecast?.forecastday)
      ? weatherPayload.forecast.forecastday
      : []
    const forecastSummary = summarizeForecastWindow(
      forecastDays.map<ForecastGuidanceDay>((item) => ({
        chanceOfRainPct: Number(item?.day?.daily_chance_of_rain) || 0,
        precipitationMm: Number(item?.day?.totalprecip_mm) || 0,
      })),
    )

    const todayIso = new Date().toISOString().slice(0, 10)
    const past30Iso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const rainfallRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          record_date::text AS record_date,
          COALESCE(inches, 0)::numeric + (COALESCE(cents, 0)::numeric / 100.0) AS rainfall_inches
        FROM rainfall_records
        WHERE tenant_id = ${sessionUser.tenantId}
          AND record_date >= ${past30Iso}::date
          AND record_date <= ${todayIso}::date
        ORDER BY record_date DESC
      `,
    )

    const last7Cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const last7Rows = (rainfallRows || []).filter((row: any) => String(row.record_date).slice(0, 10) >= last7Cutoff)
    const previousRows = (rainfallRows || []).filter((row: any) => String(row.record_date).slice(0, 10) < last7Cutoff)

    const last7ActualInches = round2(last7Rows.reduce((sum: number, row: any) => sum + (Number(row.rainfall_inches) || 0), 0))
    const previousDailyAvgInches =
      previousRows.length > 0
        ? round2(previousRows.reduce((sum: number, row: any) => sum + (Number(row.rainfall_inches) || 0), 0) / previousRows.length)
        : 0

    const dryingRisk = deriveDryingRisk(forecastSummary.next3DaysRainInches, forecastSummary.rainyDaysNext3)
    const guidance = buildWeatherOperationsGuidance(dryingRisk)
    const anomalySignal = deriveWeatherAnomalySignal({
      next3DaysRainInches: forecastSummary.next3DaysRainInches,
      recentDailyAverageInches: previousDailyAvgInches,
    })
    const irrigation = deriveIrrigationAdvice({
      next3DaysRainInches: forecastSummary.next3DaysRainInches,
      rainyDaysNext3: forecastSummary.rainyDaysNext3,
      maxChanceNext3: forecastSummary.maxChanceNext3,
      last7DaysRainInches: last7ActualInches,
      recentDailyAverageInches: previousDailyAvgInches,
      loggedDaysInLast30: rainfallRows.length,
    })

    return NextResponse.json(
      {
        success: true,
        regionQuery: locationQuery,
        forecast: {
          daysReturned: forecastSummary.daysReturned,
          next3DaysRainInches: forecastSummary.next3DaysRainInches,
          rainyDaysNext3: forecastSummary.rainyDaysNext3,
          maxChanceNext3: forecastSummary.maxChanceNext3,
        },
        actuals: {
          last7DaysRainInches: last7ActualInches,
          recentDailyAverageInches: previousDailyAvgInches,
          loggedDaysInLast30: rainfallRows.length,
        },
        dryingRisk,
        anomalySignal,
        guidance,
        irrigation,
      },
      { headers: rateHeaders },
    )
  } catch (error: any) {
    logServerError("Error building rainfall context", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to build rainfall context" },
      { status: 500 },
    )
  }
}
