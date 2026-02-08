import { type NextRequest, NextResponse } from "next/server"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"

// The location is hardcoded to Kodagu as requested.
const LOCATION = "Kodagu"
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
      console.error("WEATHERAPI_API_KEY environment variable not set.")
      return NextResponse.json({ error: "Weather service not configured. API key is missing." }, { status: 500, headers: rateHeaders })
    }

    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${LOCATION}&days=${FORECAST_DAYS}&aqi=no&alerts=no`

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
