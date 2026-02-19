import { type NextRequest, NextResponse } from "next/server"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
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
  const newsApiKey = process.env.NEWS_API_KEY // New API key for news

  let formattedWeather: any = {
    location: "São Paulo, Brazil",
    error: "Weather data unavailable.",
  }
  let marketNews: string[] = ["Real-time market news could not be fetched."]

  // Fetch Weather Data
  if (weatherApiKey) {
    try {
      const weatherResponse = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey}&q=Sao%20Paulo&days=3`,
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
      console.error("Error fetching weather data:", error)
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
      const newsQuery = encodeURIComponent("coffee AND (market OR price OR harvest OR commodity)")
      const newsUrl = `https://newsapi.org/v2/everything?q=${newsQuery}&sortBy=publishedAt&language=en&pageSize=5&apiKey=${newsApiKey}`

      const newsResponse = await fetch(newsUrl)
      if (!newsResponse.ok) {
        const errorBody = await newsResponse.json()
        throw new Error(`Failed to fetch news data. Status: ${newsResponse.status}. Message: ${errorBody.message}`)
      }
      const newsData = await newsResponse.json()

      if (newsData.articles && newsData.articles.length > 0) {
        marketNews = newsData.articles.map((article: any) => article.title)
      } else {
        marketNews = ["No recent relevant coffee market news found."]
      }
    } catch (error) {
      console.error("Error fetching news data:", error)
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
