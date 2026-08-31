import { NextResponse } from "next/server"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { withResponseCache } from "@/lib/server/response-cache"

const NEWS_CACHE_TTL_SECONDS = 60 * 60 // 1 hour — news doesn't change by the minute

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

/**
 * Is this actually about the commodity, or does it merely contain the word?
 *
 * Necessary because the plan returns three articles per query and the queries have to stay broad
 * enough to find anything at all. Verified against a live run on 2026-08-31, "pepper +India"
 * returned the Pepper Awards (a media-industry prize) and an article on surrogate advertising;
 * "coffee +India" returned a debate about NRI living costs and a Meta funding roundup. All contain
 * the word. None are about a crop.
 *
 * So an article must name a commodity AND sit in a market context. Both, because "coffee" alone
 * is a beverage and "prices" alone is everything. It is a blunt gate and it will drop the odd
 * legitimate piece -- which is the right trade for a feed an estate owner glances at: a thin
 * accurate feed is useful, a full one of coffee-machine deals trains them to ignore the tab.
 */
const COMMODITY_TERMS = [
  "coffee", "arabica", "robusta", "pepper", "cardamom", "arecanut", "areca", "spice", "plantation",
]
const MARKET_TERMS = [
  "price", "prices", "market", "export", "exports", "import", "crop", "harvest", "yield", "output",
  "production", "futures", "tonne", "tonnes", "quintal", "supply", "demand", "shortage", "surplus",
  "rain", "drought", "monsoon", "acreage", "grower", "growers", "planter", "planters", "estate",
  // Added after a test caught the gate dropping "World's top robusta supplier faces its strongest
  // El Niño in 70 years" -- a supply-shock story with no price word in it. Weather and who grows
  // the stuff are market context; that headline is exactly what an estate wants to see.
  "supplier", "suppliers", "weather", "farmer", "farmers", "cultivation", "exporter", "exporters",
]

const hasAny = (haystack: string, needles: string[]) =>
  needles.some((needle) => new RegExp(`\\b${needle}\\b`, "i").test(haystack))

export const isRelevantArticle = (title: string, description: string) => {
  const text = `${title} ${description}`
  return hasAny(text, COMMODITY_TERMS) && hasAny(text, MARKET_TERMS)
}

type Article = {
  title: string
  description: string
  url: string
  image?: string
  publishedAt: string
  source: string
}

/**
 * TheNewsAPI's free plan returns THREE articles per request, whatever `limit` says — verified
 * 2026-08-31: `limit=20` came back `{"found":18510,"returned":3,"limit":3}`. Asking for twenty is
 * silently clamped, so the only way to get a useful number of articles is several narrow requests
 * rather than one broad one. See NEWS_QUERIES.
 */
const ARTICLES_PER_REQUEST = 3

async function fetchNewsPage(
  apiKey: string,
  query: string,
  publishedAfter: string,
  options: { category?: string; sort?: string } = {},
): Promise<Article[]> {
  const category = options.category ? `&categories=${options.category}` : ""
  const sort = `&sort=${options.sort || "published_at"}`
  const url = `https://api.thenewsapi.com/v1/news/all?search=${encodeURIComponent(query)}&language=en&limit=${ARTICLES_PER_REQUEST}&published_after=${publishedAfter}${category}${sort}&api_token=${apiKey}`
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

/**
 * What we ask the news API for, and why each one.
 *
 * THE OLD QUERIES RETURNED NOTHING, FOR MONTHS. They were keyword soup --
 * "coffee arabica robusta India price market Karnataka" -- and TheNewsAPI joins bare terms with
 * AND, so an article had to contain all seven words. Nothing ever did. `found: 0` on both queries,
 * every day, which is what "both upstream queries returned empty" in Sentry has been saying since
 * 2026-08-17.
 *
 * BUT SIMPLY LOOSENING TO OR MAKES IT WORSE. `coffee | arabica | robusta` matches 18,510 articles,
 * and since the plan returns three sorted by date you get the three most recent of a vast
 * irrelevant pool -- an AeroPress listing, a Keurig discount, vegan tofu recipes. Verified.
 *
 * So: narrow, business-category, one topic each. A phrase query for the market, an India-scoped
 * query for domestic coverage, a crop query sorted by relevance rather than recency, and the same
 * for what else these estates sell. Four requests of three, deduped, is twelve candidates a day --
 * more than the two-query design could ever have produced even had it worked.
 */
const NEWS_QUERIES: Array<{ query: string; category?: string; sort?: string; windowDays: number }> = [
  // Prices as a phrase: "coffee prices" finds market reporting, `coffee +price` finds retail deals.
  { query: '"coffee prices"', category: "business", windowDays: 90 },
  // Domestic coverage. +India is an AND on purpose here -- that is the whole point of this one.
  { query: "coffee +India", category: "business", windowDays: 90 },
  // Crop and supply. Relevance, not recency: the useful piece may be six weeks old.
  { query: "robusta | arabica", category: "business", sort: "relevance_score", windowDays: 90 },
  // Pepper coverage is sparser than coffee, hence the longer window (unchanged from before).
  { query: "pepper +India | cardamom +India", category: "business", windowDays: 180 },
]

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

    // Cache key is date-scoped so it refreshes naturally each day
    const today = new Date().toISOString().slice(0, 10)
    const cacheKey = `coffee-news:${today}`

    const { data: payload, fromCache } = await withResponseCache(
      cacheKey,
      NEWS_CACHE_TTL_SECONDS,
      async () => {
        const results = await Promise.allSettled(
          NEWS_QUERIES.map((spec) =>
            fetchNewsPage(apiKey, spec.query, spec.windowDays >= 180 ? oneEightyDaysAgo : ninetyDaysAgo, {
              category: spec.category,
              sort: spec.sort,
            }),
          ),
        )
        // allSettled, so one dead query never costs the others. A single upstream failure should
        // thin the feed, not empty it.
        const fetched = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))

        const seen = new Set<string>()
        const merged = [...fetched]
          .filter((a) => {
            if (!a.url || a.url === "#" || seen.has(a.url)) return false
            // A word match is not a topic match. See isRelevantArticle.
            if (!isRelevantArticle(a.title, a.description)) return false
            seen.add(a.url)
            return true
          })
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
          .slice(0, 12)

        if (merged.length === 0) {
          // Every query empty means the upstream shape changed again, not that the world stopped
          // reporting on coffee. Log the queries so the next reader can replay them by hand.
          logServerError("coffee-news: every upstream query returned empty", {
            queries: NEWS_QUERIES.map((spec) => spec.query),
            ninetyDaysAgo,
            oneEightyDaysAgo,
          })
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
        return { success: true, articles: merged, trend, trendScore, priceSignals: priceSignals.slice(0, 6) }
      },
    )

    const cacheHeaders = fromCache ? { "X-Cache": "HIT" } : { "X-Cache": "MISS" }
    return NextResponse.json(payload, { headers: { ...rateHeaders, ...cacheHeaders } })
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
