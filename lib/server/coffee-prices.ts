import "server-only"

import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { fetchWithTimeout } from "@/lib/server/http"
import { withResponseCache } from "@/lib/server/response-cache"
import { logServerWarning } from "@/lib/server/safe-logging"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"

// Alpha Vantage "COFFEE" commodity function returns ICO composite indicator
// price in USD per pound, monthly intervals.
// Docs: https://www.alphavantage.co/documentation/#coffee
const CACHE_KEY = "coffee_prices_av_monthly"
const CACHE_TTL = 60 * 60 * 22 // 22 hours — refresh once per day with buffer

export type CoffeePricePoint = {
  date: string   // YYYY-MM-DD (first of month)
  usdPerLb: number
}

export type CoffeePriceSignal = "near-high" | "mid-range" | "near-low"

export type CoffeePriceAnalysis = {
  latest: CoffeePricePoint
  usdPerKg: number
  high3m: number   // highest in last 3 monthly points (≈ 90 days)
  low3m: number
  high9m: number   // highest in last 9 monthly points (≈ 270 days)
  low9m: number
  trend: "rising" | "falling" | "stable"
  pctFromHigh3m: number   // 0 = AT the high, negative = below it
  signal: CoffeePriceSignal
  signalSummary: string   // human-readable one-liner for the digest
  series: CoffeePricePoint[]   // last 6 monthly points, oldest first — for trend sparklines
}

async function fetchRawPrices(): Promise<CoffeePricePoint[]> {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY
  if (!apiKey) {
    logServerWarning("ALPHAVANTAGE_API_KEY not configured — coffee price advisor disabled")
    return []
  }

  const url = `https://www.alphavantage.co/query?function=COFFEE&interval=monthly&apikey=${apiKey}`
  const res = await fetchWithTimeout(url, { timeoutMs: 12_000 })
  if (!res.ok) return []

  const json = await res.json().catch(() => null)
  if (!Array.isArray(json?.data)) return []

  return (json.data as Array<{ date: string; value: string }>)
    // Alpha Vantage returns coffee prices in US cents per pound (standard
    // soft-commodity convention) — convert to USD/lb here.
    .map((p) => ({ date: String(p.date || ""), usdPerLb: (Number(p.value) || 0) / 100 }))
    .filter((p) => p.usdPerLb > 0 && p.date)
    .slice(0, 12) // keep last 12 months
}

export async function getCoffeePriceAnalysis(): Promise<CoffeePriceAnalysis | null> {
  try {
    const { data: prices } = await withResponseCache<CoffeePricePoint[]>(
      CACHE_KEY,
      CACHE_TTL,
      fetchRawPrices,
    )

    if (!prices || prices.length < 3) return null

    const latest = prices[0]
    const vals3m = prices.slice(0, 3).map((p: CoffeePricePoint) => p.usdPerLb)
    const vals9m = prices.slice(0, 9).map((p: CoffeePricePoint) => p.usdPerLb)

    const high3m = Math.max(...vals3m)
    const low3m = Math.min(...vals3m)
    const high9m = Math.max(...vals9m)
    const low9m = Math.min(...vals9m)

    // Trend: compare latest vs 2 months ago (±2% threshold = stable)
    const older = (prices[2] as CoffeePricePoint | undefined)?.usdPerLb ?? latest.usdPerLb
    const trendPct = ((latest.usdPerLb - older) / older) * 100
    const trend = trendPct > 2 ? "rising" : trendPct < -2 ? "falling" : "stable"

    // How far from the 3-month high (0 = at the high, negative = below)
    const pctFromHigh3m = ((latest.usdPerLb - high3m) / high3m) * 100

    // Signal bands
    const signal: CoffeePriceSignal =
      pctFromHigh3m >= -5 ? "near-high" : pctFromHigh3m <= -20 ? "near-low" : "mid-range"

    const usdPerKg = latest.usdPerLb * 2.2046 // USD/lb → USD/kg

    const trendWord = trend === "rising" ? "↑ rising" : trend === "falling" ? "↓ falling" : "→ stable"
    const signalSummary =
      signal === "near-high"
        ? `Coffee at a 3-month high ($${usdPerKg.toFixed(2)}/kg, ${trendWord}) — consider timing a sale.`
        : signal === "near-low"
          ? `Coffee near a 3-month low ($${usdPerKg.toFixed(2)}/kg, ${trendWord}) — holding may be worth it.`
          : `Coffee mid-range at $${usdPerKg.toFixed(2)}/kg (${trendWord}, ${Math.abs(pctFromHigh3m).toFixed(1)}% below 3-month high).`

    const series = prices.slice(0, 6).slice().reverse() // oldest first, for trend sparklines

    return { latest, usdPerKg, high3m, low3m, high9m, low9m, trend, pctFromHigh3m, signal, signalSummary, series }
  } catch {
    return null
  }
}

export type SellableStockEstimate = {
  producedKg: number
  soldKg: number
  availableKg: number
  fiscalYearStart: string
  fiscalYearEnd: string
}

export async function estimateSellableStock(tenantId: string): Promise<SellableStockEstimate | null> {
  if (!sql) return null

  try {
    const fy = getCurrentFiscalYear()
    const fiscalYearStart = fy.startDate
    const fiscalYearEnd = fy.endDate
    const tenantContext = normalizeTenantContext(tenantId, "admin")

    const [producedRows, soldRows] = await runTenantQueries(sql, tenantContext, [
      sql.query(
        `SELECT
           COALESCE(SUM(dry_parch), 0) + COALESCE(SUM(dry_cherry), 0) AS total_kg
         FROM processing_records
         WHERE tenant_id = $1
           AND process_date BETWEEN $2::date AND $3::date`,
        [tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `SELECT COALESCE(SUM(
           COALESCE(NULLIF(kgs, 0), NULLIF(weight_kgs, 0),
             bags_sold * COALESCE((SELECT bag_weight_kg FROM tenants WHERE id = $1 LIMIT 1), 50))
         ), 0) AS total_kg
         FROM sales_records
         WHERE tenant_id = $1
           AND sale_date BETWEEN $2::date AND $3::date`,
        [tenantId, fiscalYearStart, fiscalYearEnd],
      ),
    ])

    const toRows = (r: unknown): any[] => Array.isArray(r) ? r : (r as any)?.rows ?? []
    const producedKg = Number(toRows(producedRows)[0]?.total_kg ?? 0)
    const soldKg = Number(toRows(soldRows)[0]?.total_kg ?? 0)
    const availableKg = Math.max(0, producedKg - soldKg)

    return { producedKg, soldKg, availableKg, fiscalYearStart, fiscalYearEnd }
  } catch {
    return null
  }
}

export function buildMarketTimingSection(
  price: CoffeePriceAnalysis,
  stock: SellableStockEstimate | null,
): string {
  const lines: string[] = ["## Market Timing"]

  lines.push(`- ICO benchmark: $${price.usdPerKg.toFixed(2)}/kg (${price.latest.date})`)
  lines.push(`- 3-month range: $${(price.low3m * 2.2046).toFixed(2)} – $${(price.high3m * 2.2046).toFixed(2)}/kg`)
  lines.push(`- Trend: ${price.trend} | Signal: ${price.signal === "near-high" ? "🟢 near 3-month high" : price.signal === "near-low" ? "🔴 near 3-month low" : "🟡 mid-range"}`)

  if (stock && stock.availableKg > 0) {
    lines.push(`- Estimated unsold stock this season: ~${Math.round(stock.availableKg).toLocaleString("en-IN")} kg`)
    lines.push(`- ${price.signalSummary}`)
  } else if (stock && stock.producedKg === 0) {
    lines.push(`- No processing records this season — price context only.`)
    lines.push(`- ${price.signalSummary}`)
  } else {
    lines.push(`- ${price.signalSummary}`)
  }

  lines.push("- Note: ICO benchmark in USD/kg; your local INR price will vary by buyer and grade.")

  return lines.join("\n")
}
