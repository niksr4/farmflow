import { describe, expect, it } from "vitest"

import {
  isMissingRelation,
  normalizeBagType,
  resolveDispatchReceivedKgs,
  resolveSalesKgs,
  summariseProcessingByVariety,
  toLocationBucket,
} from "../lib/server/season-summary-utils"

describe("processing totals per variety", () => {
  it("SUMS rows that share a variety instead of keeping the last one", () => {
    /**
     * The route's query does `GROUP BY coffee_type` on the RAW column, so two spellings of one
     * variety arrive as two rows. Canonicalising them to one label is right; doing it with `.set()`
     * kept only the last row and dropped the other's kilos out of the revenue-per-kg denominator,
     * leaving a plausible wrong number and nothing on screen to say so.
     *
     * This was inlined in the route and therefore untested -- a tamper removing the summing passed
     * the entire suite. That is why it lives here.
     */
    const { processingByType, yieldByCoffeeType } = summariseProcessingByVariety([
      { coffee_type: "Arabica", crop_todate: 1000, ripe_todate: 900, dry_parchment: 200, dry_cherry: 0 },
      { coffee_type: "arabica", crop_todate: 500, ripe_todate: 400, dry_parchment: 100, dry_cherry: 25 },
      { coffee_type: "Robusta", crop_todate: 2000, ripe_todate: 1800, dry_parchment: 0, dry_cherry: 400 },
    ])

    expect([...processingByType.keys()], "two spellings become one entry").toEqual(["Arabica", "Robusta"])
    expect(processingByType.get("Arabica")).toEqual({ crop: 1500, ripe: 1300, dry: 325 })
    expect(processingByType.get("Robusta")).toEqual({ crop: 2000, ripe: 1800, dry: 400 })

    // And the yield list is derived from those totals, so it cannot emit two "Arabica" lines.
    expect(yieldByCoffeeType.map((r) => r.coffeeType)).toEqual(["Arabica", "Robusta"])
    const arabica = yieldByCoffeeType[0]
    expect(arabica.cropKgs).toBe(1500)
    expect(arabica.dryKgs).toBe(325)
    expect(arabica.ratio).toBeCloseTo(325 / 1500, 10)
  })

  it("names an unrecognised variety rather than echoing or dropping it", () => {
    const { processingByType } = summariseProcessingByVariety([
      { coffee_type: "excelsa", crop_todate: 10, dry_parchment: 1 },
      { coffee_type: null, crop_todate: 5, dry_parchment: 1 },
    ])
    // Both unknowns land in one named bucket, so the kilos stay visible and countable.
    expect([...processingByType.keys()]).toEqual(["Unspecified"])
    expect(processingByType.get("Unspecified")).toEqual({ crop: 15, ripe: 0, dry: 2 })
  })

  it("is empty for no rows, and for null", () => {
    expect(summariseProcessingByVariety([]).yieldByCoffeeType).toEqual([])
    expect(summariseProcessingByVariety(null).processingByType.size).toBe(0)
  })
})

describe("season summary utils", () => {
  it("normalizes bag type and location buckets", () => {
    expect(normalizeBagType("dry cherry")).toBe("Dry Cherry")
    expect(normalizeBagType("parchment")).toBe("Dry Parchment")
    expect(toLocationBucket("Main A", "")).toBe("MAIN")
    expect(toLocationBucket("Hill Block", "HB")).toBe("HB")
    expect(toLocationBucket("", "")).toBe("Unknown")
  })

  it("uses confirmed dispatch KGs and sales fallback order", () => {
    expect(resolveDispatchReceivedKgs({ kgs_received: 210, bags_dispatched: 2 }, 50)).toBe(210)
    expect(resolveDispatchReceivedKgs({ kgs_received: 0, bags_dispatched: 2 }, 50)).toBe(0)

    expect(resolveSalesKgs({ sold_kgs: 120, bags_sold: 3 }, 50)).toBe(120)
    expect(resolveSalesKgs({ sold_kgs: 0, kgs: 75, bags_sold: 3 }, 50)).toBe(75)
    expect(resolveSalesKgs({ sold_kgs: 0, kgs: 0, bags_sold: 3 }, 50)).toBe(150)
  })

  it("detects missing relation errors", () => {
    const error = new Error('relation "receivables" does not exist')
    expect(isMissingRelation(error, "receivables")).toBe(true)
    expect(isMissingRelation(error, "journal_entries")).toBe(false)
  })
})
