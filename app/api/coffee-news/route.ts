import { NextResponse } from "next/server"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"
export const revalidate = 0

const POSITIVE_KEYWORDS = ["surge", "rally", "rise", "rises", "up", "higher", "gain", "jump", "spike", "record", "premium", "demand", "export", "bumper"]
const NEGATIVE_KEYWORDS = ["drop", "fall", "falls", "down", "lower", "slump", "plunge", "decline", "weak", "drought", "glut", "oversupply", "borer", "damage"]

function scoreHeadline(text: string) {
  const lower = text.toLowerCase()
  let score = 0
  POSITIVE_KEYWORDS.forEach((word) => { if (lower.includes(word)) score += 1 })
  NEGATIVE_KEYWORDS.forEach((word) => { if (lower.includes(word)) score -= 1 })
  return score
}

function extractPriceMentions(text: string) {
  // Matches ₹/Rs/INR prices (Indian rupee — primary) and $/USD (ICE futures reference)
  const matches = text.match(/(₹|rs\.?|inr|\$|usd)\s?\d+(?:[,.\d]+)?(?:\s?(?:per\s+(?:kg|quintal|bag|tonne)|\/?(?:kg|qtl|mt)))?/gi)
  return matches ? matches.map((m) => m.trim()) : []
}

type Article = {
  title: string
  description: string
  url: string
  image?: string
  publishedAt: string
  source: string
}

async function fetchNewsPage(apiKey: string, query: string, publishedAfter: string, limit: number): Promise<Article[]> {
  const url = `https://api.thenewsapi.com/v1/news/all?search=${encodeURIComponent(query)}&language=en&limit=${limit}&published_after=${publishedAfter}&sort=published_at&api_token=${apiKey}`
  const response = await fetchWithTimeout(url, { timeoutMs: 8_000 })
  if (!response.ok) return []
  const data = await response.json()
  const articles = Array.isArray(data.data) ? data.data : []
  return articles
    .filter((a: any) => {
      const d = new Date(String(a.published_at || ""))
      return !isNaN(d.getTime())
    })
    .map((a: any): Article => ({
      title: String(a.title || ""),
      description: String(a.description || ""),
      url: String(a.url || "#"),
      image: a.image_url || undefined,
      publishedAt: String(a.published_at || ""),
      source: String(a.source || "Unknown"),
    }))
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

    // Rolling windows — coffee is checked over 90 days, pepper over 180 days
    // (pepper coverage on this API is sparser than coffee)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const oneEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    // Parallel fetch: coffee market news + pepper/spice market news (India-focused)
    // Most Karnataka/Kerala estates grow both; pepper prices are equally important
    const [coffeeResult, pepperResult] = await Promise.allSettled([
      fetchNewsPage(apiKey, "coffee arabica robusta India price market Karnataka", ninetyDaysAgo, 20),
      fetchNewsPage(apiKey, "pepper spice India price market export Karnataka Kerala", oneEightyDaysAgo, 10),
    ])

    const coffeeArticles = coffeeResult.status === "fulfilled" ? coffeeResult.value : []
    const pepperArticles = pepperResult.status === "fulfilled" ? pepperResult.value : []

    // Merge and deduplicate by URL, then sort newest first
    const seen = new Set<string>()
    const merged = [...coffeeArticles, ...pepperArticles]
      .filter((a) => {
        if (!a.url || a.url === "#" || seen.has(a.url)) return false
        seen.add(a.url)
        return true
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 25)

    if (merged.length === 0) {
      logServerError("coffee-news: both upstream queries returned empty", { ninetyDaysAgo, oneEightyDaysAgo })
    }

    let trendScore = 0
    const priceSignals: { title: string; value: string; source: string }[] = []

    for (const article of merged) {
      const combined = `${article.title} ${article.description}`
      trendScore += scoreHeadline(combined)
      extractPriceMentions(combined).forEach((value) => {
        priceSignals.push({ title: article.title, value, source: article.source })
      })
    }

    const trend = trendScore > 2 ? "Bullish" : trendScore < -2 ? "Bearish" : "Neutral"

    return NextResponse.json({
      success: true,
      articles: merged,
      trend,
      trendScore,
      priceSignals: priceSignals.slice(0, 6),
    }, { headers: rateHeaders })
  } catch (error: any) {
    logServerError("Error fetching coffee news", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Failed to fetch market news.") },
      { status: 500 },
    )
  }
}
