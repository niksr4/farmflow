import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError, logServerWarning } from "@/lib/server/safe-logging"
import { parseJsonObject } from "@/lib/server/tenant-experience-db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { buildTenantWeatherQuery } from "@/lib/tenant-estate-profile"
import { WEATHER_FORECAST_DAYS } from "@/lib/weather-guidance"
import { DEFAULT_WEATHER_QUERY, normalizeWeatherLocationQuery } from "@/lib/weather-config"
import { withResponseCache } from "@/lib/server/response-cache"

const WEATHER_CACHE_TTL_SECONDS = 30 * 60 // 30 minutes

export const dynamic = "force-dynamic"
export const revalidate = 0

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
    )}&days=${WEATHER_FORECAST_DAYS}&aqi=no&alerts=no`

    const cacheKey = `weather:${locationQuery.toLowerCase().replace(/\s+/g, "_")}`

    const { data, fromCache } = await withResponseCache(cacheKey, WEATHER_CACHE_TTL_SECONDS, async () => {
      let response = await fetchWithTimeout(url, { timeoutMs: 8_000 })
      // WeatherAPI 5xx responses are usually a brief upstream blip — one quick retry
      // resolves most of them without surfacing an error to the user.
      if (!response.ok && response.status >= 500) {
        response = await fetchWithTimeout(url, { timeoutMs: 8_000 })
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = (errorData as any)?.error?.message || response.statusText
        if (response.status >= 500) {
          logServerWarning("WeatherAPI upstream unavailable after retry", errorData)
        } else {
          logServerError("Error from WeatherAPI.com", errorData)
        }
        throw new Error(`Weather API error: ${errorMessage}`)
      }
      return response.json()
    })

    const cacheHeaders = fromCache ? { "X-Cache": "HIT" } : { "X-Cache": "MISS" }
    return NextResponse.json(data, { headers: { ...rateHeaders, ...cacheHeaders } })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Error fetching weather data", error)
    return NextResponse.json({ error: "An internal error occurred while fetching weather data." }, { status: 500 })
  }
}
