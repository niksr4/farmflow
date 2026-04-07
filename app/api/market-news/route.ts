import { type NextRequest, NextResponse } from "next/server"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest) {
  let rateHeaders: HeadersInit | undefined

  try {
    const sessionUser = await requireModuleAccess("news")
    const rateLimit = await checkRateLimit("news", sessionUser.tenantId)
    rateHeaders = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateHeaders })
    }
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const weatherApiKey = process.env.WEATHERAPI_API_KEY
  const newsApiKey = process.env.THENEWSAPI_API_KEY

  let formattedWeather: any = {
    location: "São Paulo, Brazil",
    error: "Weather data unavailable.",
  }
  let marketNews: string[] = ["Real-time market news could not be fetched."]

  // Fetch Weather Data
  if (weatherApiKey) {
    try {
      const weatherResponse = await fetchWithTimeout(
        `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey}&q=Sao%20Paulo&days=3`,
        { timeoutMs: 8_000 },
      )

      const contentType = weatherResponse.headers.get("content-type") ?? ""
      const rawBody = await weatherResponse.text()

      // WeatherAPI sometimes responds with HTML/plain-text when the request is wrong.
      if (!contentType.includes("application/json")) {
        throw new Error(`Unexpected response from WeatherAPI: ${rawBody.slice(0, 80)}`)
      }

      const weatherData = JSON.parse(rawBody)

      formattedWeather = {
        location: `${weatherData.location.name}, ${weatherData.location.country}`,
        currentTempC: weatherData.current.temp_c,
        condition: weatherData.current.condition.text,
        forecast: weatherData.forecast.forecastday.map((day: any) => ({
          date: day.date,
          maxTempC: day.day.maxtemp_c,
          minTempC: day.day.mintemp_c,
          condition: day.day.condition.text,
        })),
      }
    } catch (error) {
      logServerError("Error fetching market-news weather data", error)
      formattedWeather = {
        location: "São Paulo, Brazil",
        error: "Failed to fetch live weather data.",
      }
    }
  } else {
    formattedWeather.error = "Weather API key not configured."
  }

  // Fetch Real News Data
  if (newsApiKey) {
    try {
      const keywords = encodeURIComponent("coffee market price harvest commodity")
      const newsUrl = `https://api.thenewsapi.com/v1/news/all?search=${keywords}&language=en&limit=5&sort=published_at&api_token=${newsApiKey}`

      const newsResponse = await fetchWithTimeout(newsUrl, { timeoutMs: 8_000 })
      if (!newsResponse.ok) {
        const errorBody = await newsResponse.text()
        throw new Error(`Failed to fetch news data. Status: ${newsResponse.status}. Body: ${errorBody.slice(0, 80)}`)
      }
      const newsData = await newsResponse.json()
      const articles = Array.isArray(newsData.data) ? newsData.data : []

      marketNews = articles.length > 0
        ? articles.map((article: any) => String(article.title || ""))
        : ["No recent relevant coffee market news found."]
    } catch (error) {
      logServerError("Error fetching market news", error)
      marketNews = ["Error fetching real-time market news."]
    }
  } else {
    marketNews = ["News API key not configured."]
  }

  return NextResponse.json({
    brazilWeather: formattedWeather,
    marketNews: marketNews,
  }, rateHeaders ? { headers: rateHeaders } : undefined)
}
