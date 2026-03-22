import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError } from "@/lib/server/safe-logging"
import { parseJsonObject } from "@/lib/server/tenant-experience-db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { buildTenantWeatherQuery } from "@/lib/tenant-estate-profile"
import { DEFAULT_WEATHER_QUERY, normalizeWeatherLocationQuery } from "@/lib/weather-config"

const FORECAST_DAYS = "8"

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("weather")
    const rateLimit = await checkRateLimit("weather", sessionUser.tenantId)
    const rateHeaders = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateHeaders })
    }
    const apiKey = process.env.WEATHERAPI_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: "Weather service not configured. API key is missing." }, { status: 503, headers: rateHeaders })
    }

    const { searchParams } = new URL(request.url)
    const requestedRegion = (searchParams.get("region") || searchParams.get("q") || "").trim()
    const explicitLocationQuery = normalizeWeatherLocationQuery(requestedRegion)
    if (requestedRegion.length > 0 && !explicitLocationQuery) {
      return NextResponse.json({ error: "Region query too long." }, { status: 400, headers: rateHeaders })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    let locationQuery = explicitLocationQuery
    if (!locationQuery) {
      const rows = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT ui_preferences
          FROM tenants
          WHERE id = ${tenantContext.tenantId}
          LIMIT 1
        `,
      )
      const parsedUiPreferences = parseJsonObject(rows?.[0]?.ui_preferences, "tenant weather ui preferences")
      locationQuery = buildTenantWeatherQuery(parsedUiPreferences?.estateProfile) || DEFAULT_WEATHER_QUERY
    }

    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(
      locationQuery,
    )}&days=${FORECAST_DAYS}&aqi=no&alerts=no`

    const response = await fetchWithTimeout(url, {
      next: { revalidate: 3600 }, // Revalidate every hour
      timeoutMs: 8_000,
    })

    if (!response.ok) {
      const errorData = await response.json()
      logServerError("Error from WeatherAPI.com", errorData)
      const errorMessage = errorData?.error?.message || response.statusText
      return NextResponse.json({ error: `Failed to fetch weather data: ${errorMessage}` }, { status: response.status, headers: rateHeaders })
    }

    const data = await response.json()
    return NextResponse.json(data, { headers: rateHeaders })
  } catch (error) {
    logServerError("Error fetching weather data", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ error: "An internal error occurred while fetching weather data." }, { status: 500 })
  }
}
