import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAnyModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"

const LOCATION = "12.4244,75.7382"
const FORECAST_DAYS = "8"
const MM_PER_INCH = 25.4

const REGION_ALIASES: Record<string, string> = {
  "kodagu, india": "12.4244,75.7382",
  "coorg, india": "12.4244,75.7382",
  "chikmagalur, india": "13.3153,75.7754",
  "wayanad, india": "11.6854,76.1320",
  "idukki, india": "9.8499,76.9730",
  "nilgiris, india": "11.4064,76.6932",
  "araku, india": "18.3270,82.8772",
  "bababudangiri, india": "13.3902,75.7215",
}

const toInches = (millimeters: number) => millimeters / MM_PER_INCH
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

type ForecastDay = {
  date: string
  day: {
    daily_chance_of_rain?: number
    totalprecip_mm?: number
  }
}

const deriveDryingRisk = (rainInchesNext3: number, rainyDaysNext3: number) => {
  if (rainyDaysNext3 >= 2 || rainInchesNext3 >= 1.2) return "high"
  if (rainyDaysNext3 >= 1 || rainInchesNext3 >= 0.5) return "medium"
  return "low"
}

const buildGuidance = (risk: string) => {
  if (risk === "high") {
    return {
      drying: "High drying disruption risk. Prioritize covered drying areas and fast-turn micro lots.",
      picking: "Keep picking selective and avoid building large wet backlog until rain window clears.",
      operations: "Move ready parchment to protected storage and increase moisture checks.",
    }
  }
  if (risk === "medium") {
    return {
      drying: "Moderate rain risk. Plan for intermittent cover and tighter turning cadence.",
      picking: "Schedule picking in first half of day and process cherries quickly.",
      operations: "Track moisture drift daily and keep dispatch plans flexible.",
    }
  }
  return {
    drying: "Low near-term rain risk. Strong window for drying throughput.",
    picking: "Good window to run full picking schedule if labor is available.",
    operations: "Use this period to clear pending lots before the next weather shift.",
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
    const normalizedRequestedRegion = requestedRegion.toLowerCase()
    const locationQuery = requestedRegion.length > 0 ? REGION_ALIASES[normalizedRequestedRegion] ?? requestedRegion : LOCATION

    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(
      locationQuery,
    )}&days=${FORECAST_DAYS}&aqi=no&alerts=no`

    const weatherResponse = await fetch(url, { next: { revalidate: 1800 } })
    const weatherPayload = await weatherResponse.json().catch(() => ({}))
    if (!weatherResponse.ok) {
      const message = weatherPayload?.error?.message || weatherResponse.statusText
      return NextResponse.json({ success: false, error: `Failed to fetch forecast: ${message}` }, { status: weatherResponse.status, headers: rateHeaders })
    }

    const forecastDays: ForecastDay[] = Array.isArray(weatherPayload?.forecast?.forecastday)
      ? weatherPayload.forecast.forecastday
      : []
    const next3Days = forecastDays.slice(0, 3)
    const next7Days = forecastDays.slice(0, 7)

    const rainInchesNext3 = round2(
      next3Days.reduce((sum, item) => sum + toInches(Number(item?.day?.totalprecip_mm) || 0), 0),
    )
    const rainInchesNext7 = round2(
      next7Days.reduce((sum, item) => sum + toInches(Number(item?.day?.totalprecip_mm) || 0), 0),
    )
    const rainyDaysNext3 = next3Days.filter(
      (item) => (Number(item?.day?.daily_chance_of_rain) || 0) >= 60 || (Number(item?.day?.totalprecip_mm) || 0) >= 2,
    ).length
    const maxChanceNext3 = next3Days.reduce((max, item) => Math.max(max, Number(item?.day?.daily_chance_of_rain) || 0), 0)

    const todayIso = new Date().toISOString().slice(0, 10)
    const past30Iso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const rainfallRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          record_date,
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

    const dryingRisk = deriveDryingRisk(rainInchesNext3, rainyDaysNext3)
    const guidance = buildGuidance(dryingRisk)
    const anomalySignal =
      rainInchesNext7 >= 1.8 && previousDailyAvgInches <= 0.08
        ? "Rain spike vs recent trend"
        : rainInchesNext7 <= 0.3 && previousDailyAvgInches >= 0.2
          ? "Dry spell vs recent trend"
          : "Near recent trend"

    return NextResponse.json(
      {
        success: true,
        regionQuery: locationQuery,
        forecast: {
          next3DaysRainInches: rainInchesNext3,
          next7DaysRainInches: rainInchesNext7,
          rainyDaysNext3,
          maxChanceNext3,
        },
        actuals: {
          last7DaysRainInches: last7ActualInches,
          recentDailyAverageInches: previousDailyAvgInches,
          loggedDaysInLast30: rainfallRows.length,
        },
        dryingRisk,
        anomalySignal,
        guidance,
      },
      { headers: rateHeaders },
    )
  } catch (error: any) {
    console.error("Error building rainfall context:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to build rainfall context" },
      { status: 500 },
    )
  }
}
