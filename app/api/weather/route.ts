import { type NextRequest, NextResponse } from "next/server"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"

// Default location if no region is provided (Madikeri, Kodagu).
const LOCATION = "12.4244,75.7382"
const FORECAST_DAYS = "8"

// Backward-compatible aliases for older clients that still send text labels.
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
      console.error("WEATHERAPI_API_KEY environment variable not set.")
      return NextResponse.json({ error: "Weather service not configured. API key is missing." }, { status: 500, headers: rateHeaders })
    }

    const { searchParams } = new URL(request.url)
    const requestedRegion = (searchParams.get("region") || searchParams.get("q") || "").trim()
    const normalizedRequestedRegion = requestedRegion.toLowerCase()
    const locationQuery = requestedRegion.length > 0 ? (REGION_ALIASES[normalizedRequestedRegion] ?? requestedRegion) : LOCATION

    if (locationQuery.length > 80) {
      return NextResponse.json({ error: "Region query too long." }, { status: 400, headers: rateHeaders })
    }

    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(
      locationQuery,
    )}&days=${FORECAST_DAYS}&aqi=no&alerts=no`

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Revalidate every hour
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Error from WeatherAPI.com:", errorData)
      const errorMessage = errorData?.error?.message || response.statusText
      return NextResponse.json({ error: `Failed to fetch weather data: ${errorMessage}` }, { status: response.status, headers: rateHeaders })
    }

    const data = await response.json()
    return NextResponse.json(data, { headers: rateHeaders })
  } catch (error) {
    console.error("Error fetching weather data:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ error: "An internal error occurred while fetching weather data." }, { status: 500 })
  }
}
