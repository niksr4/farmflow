import { describe, expect, it } from "vitest"

import { buildMarketTimingSection, type CoffeePriceAnalysis, type SellableStockEstimate } from "../lib/server/coffee-prices"

const basePrice: CoffeePriceAnalysis = {
  latest: { date: "2026-07-01", usdPerLb: 2.5 },
  usdPerKg: 5.51,
  high3m: 2.6,
  low3m: 2.2,
  high9m: 2.8,
  low9m: 2.0,
  trend: "stable",
  pctFromHigh3m: -3.8,
  signal: "mid-range",
  signalSummary: "Coffee mid-range at $5.51/kg (→ stable, 3.8% below 3-month high).",
  series: [],
}

describe("buildMarketTimingSection", () => {
  it("includes the estimated unsold stock when there is sellable inventory", () => {
    const stock: SellableStockEstimate = {
      producedKg: 1000,
      soldKg: 400,
      availableKg: 600,
      fiscalYearStart: "2026-04-01",
      fiscalYearEnd: "2027-03-31",
    }
    const section = buildMarketTimingSection(basePrice, stock)
    expect(section).toContain("Estimated unsold stock this season: ~600 kg")
    expect(section).toContain(basePrice.signalSummary)
  })

  it("notes 'price context only' when nothing has been processed this season yet", () => {
    const stock: SellableStockEstimate = {
      producedKg: 0,
      soldKg: 0,
      availableKg: 0,
      fiscalYearStart: "2026-04-01",
      fiscalYearEnd: "2027-03-31",
    }
    const section = buildMarketTimingSection(basePrice, stock)
    expect(section).toContain("No processing records this season — price context only.")
  })

  it("falls back to price-only context when stock is null (estimate unavailable)", () => {
    const section = buildMarketTimingSection(basePrice, null)
    expect(section).not.toContain("Estimated unsold stock")
    expect(section).not.toContain("No processing records")
    expect(section).toContain(basePrice.signalSummary)
  })

  it("omits the stock line when everything produced this season has already sold (availableKg 0, producedKg > 0)", () => {
    // Neither the availableKg>0 branch nor the producedKg===0 branch matches here, so this
    // silently falls into the plain signalSummary-only branch — worth confirming that's the
    // intended UX (vs. e.g. "fully sold" messaging) rather than an accidental gap.
    const stock: SellableStockEstimate = {
      producedKg: 500,
      soldKg: 500,
      availableKg: 0,
      fiscalYearStart: "2026-04-01",
      fiscalYearEnd: "2027-03-31",
    }
    const section = buildMarketTimingSection(basePrice, stock)
    expect(section).not.toContain("Estimated unsold stock")
    expect(section).not.toContain("No processing records")
    expect(section).toContain(basePrice.signalSummary)
  })

  it("renders the correct signal emoji for each band", () => {
    expect(buildMarketTimingSection({ ...basePrice, signal: "near-high" }, null)).toContain("🟢 near 3-month high")
    expect(buildMarketTimingSection({ ...basePrice, signal: "near-low" }, null)).toContain("🔴 near 3-month low")
    expect(buildMarketTimingSection({ ...basePrice, signal: "mid-range" }, null)).toContain("🟡 mid-range")
  })
})
