import { type NextRequest, NextResponse } from "next/server"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"

// Supplementary endpoint — returns a flat list of recent headline strings.
// The primary news UI uses /api/coffee-news which returns richer structured data.

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

  const newsApiKey = process.env.THENEWSAPI_API_KEY
  let marketNews: string[] = ["Real-time market news could not be fetched."]

  if (newsApiKey) {
    try {
      const publishedAfter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const keywords = encodeURIComponent("coffee pepper India price market Karnataka Kerala")
      const newsUrl = `https://api.thenewsapi.com/v1/news/all?search=${keywords}&language=en&limit=5&published_after=${publishedAfter}&sort=published_at&api_token=${newsApiKey}`

      const newsResponse = await fetchWithTimeout(newsUrl, { timeoutMs: 8_000 })
      if (!newsResponse.ok) {
        throw new Error(`News API returned ${newsResponse.status}`)
      }
      const newsData = await newsResponse.json()
      const articles = Array.isArray(newsData.data) ? newsData.data : []
      marketNews = articles.length > 0
        ? articles.map((a: any) => String(a.title || ""))
        : ["No recent relevant market news found."]
    } catch (error) {
      logServerError("Error fetching market news", error)
      marketNews = ["Error fetching real-time market news."]
    }
  } else {
    marketNews = ["News API key not configured."]
  }

  return NextResponse.json({ marketNews }, rateHeaders ? { headers: rateHeaders } : undefined)
}
