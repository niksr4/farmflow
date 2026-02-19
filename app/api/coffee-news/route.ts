import { NextResponse } from "next/server"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"

const POSITIVE_KEYWORDS = ["surge", "rally", "rise", "rises", "up", "higher", "gain", "jump", "spike", "record"]
const NEGATIVE_KEYWORDS = ["drop", "fall", "falls", "down", "lower", "slump", "plunge", "decline", "weak"]

function scoreHeadline(text: string) {
  const lower = text.toLowerCase()
  let score = 0
  POSITIVE_KEYWORDS.forEach((word) => {
    if (lower.includes(word)) score += 1
  })
  NEGATIVE_KEYWORDS.forEach((word) => {
    if (lower.includes(word)) score -= 1
  })
  return score
}

function extractPriceMentions(text: string) {
  const matches = text.match(/(₹|rs\.?|inr|\$|usd|eur)\s?\d+(?:[\.,]\d+)?/gi)
  return matches ? matches.map((match) => match.trim()) : []
}

export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("news")
    const rateLimit = await checkRateLimit("news", sessionUser.tenantId)
    const rateHeaders = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429, headers: rateHeaders })
    }
    const apiKey = process.env.THENEWSAPI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "News service not configured. API key is missing." },
        { status: 500 },
      )
    }

    const keywords = encodeURIComponent("coffee arabica robusta price market")
    const publishedAfter = encodeURIComponent("2024-01-01")
    const url = `https://api.thenewsapi.com/v1/news/all?search=${keywords}&language=en&limit=25&published_after=${publishedAfter}&sort=published_at&api_token=${apiKey}`

    const response = await fetch(url, {
      next: { revalidate: 1800 },
    })

    if (!response.ok) {
      const errorBody = await response.text()
      return NextResponse.json(
        { success: false, error: `Failed to fetch news: ${response.status} ${errorBody}` },
        { status: response.status },
      )
    }

    const data = await response.json()
    const articles = Array.isArray(data.data) ? data.data : []

    let trendScore = 0
    const priceSignals: { title: string; value: string; source: string }[] = []

    const normalized = articles
      .filter((article: any) => {
        const publishedAt = String(article.published_at || "")
        if (!publishedAt) return false
        const publishedDate = new Date(publishedAt)
        return !isNaN(publishedDate.getTime()) && publishedDate.getFullYear() >= 2024
      })
      .map((article: any) => {
        const title = String(article.title || "")
        const description = String(article.description || "")
        const combined = `${title} ${description}`
        trendScore += scoreHeadline(combined)

      const prices = extractPriceMentions(combined)
      prices.forEach((value) => {
        priceSignals.push({
          title,
          value,
          source: article.source || "Unknown",
        })
      })

        return {
          title,
          description,
          url: String(article.url || "#"),
          image: article.image_url || undefined,
          publishedAt: String(article.published_at || ""),
          source: article.source || "Unknown",
        }
      })

    const trend = trendScore > 2 ? "Bullish" : trendScore < -2 ? "Bearish" : "Neutral"

    return NextResponse.json({
      success: true,
      articles: normalized,
      trend,
      trendScore,
      priceSignals: priceSignals.slice(0, 6),
    }, { headers: rateHeaders })
  } catch (error: any) {
    console.error("Error fetching coffee news:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch market news." },
      { status: 500 },
    )
  }
}
