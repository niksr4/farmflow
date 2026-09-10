import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { STOCK_PRICE_SANITY_MULTIPLE, stockPriceLooksWrong } from "@/lib/stock-cost"

/**
 * A restock priced twenty times the item's own history is a total in the wrong box.
 *
 * THE TWO INCIDENTS THIS IS BUILT FROM, both real, both in production:
 *
 *   HoneyFarm, petrol   Rs 4,480 entered per litre against a real Rs 112.08   —  40x
 *   Seshagiri, DAP      Rs 70,000 entered per bag against a real Rs 1,350     —  52x
 *
 * Each was the invoice total typed into the per-unit field. Each passed every check the product
 * had — the amount was positive, the quantity was right, the arithmetic was internally consistent —
 * and each silently destroyed the weighted average that every later depletion is costed from.
 * HoneyFarm's petrol stood at Rs 2,172 a litre for two months against a Rs 112 item; Seshagiri's
 * unassigned pile showed Rs 1.03 crore of stock value against roughly Rs 2.6 lakh of purchases.
 *
 * The existing guard refuses a Rs 0 restock, for exactly the same reason — a zero corrupts the
 * average. It was never given the other half of the range.
 */

describe("the two incidents that actually happened", () => {
  it("catches HoneyFarm's petrol: Rs 4,480 a litre against Rs 112.08", () => {
    const s = stockPriceLooksWrong({ unitPrice: 4480, existingAvgPrice: 112.08 })
    expect(s).not.toBeNull()
    expect(s!.direction).toBe("high")
    expect(Math.round(s!.ratio)).toBe(40)
  })

  it("catches Seshagiri's DAP: Rs 70,000 a bag against Rs 1,350", () => {
    const s = stockPriceLooksWrong({ unitPrice: 70000, existingAvgPrice: 1350 })
    expect(s).not.toBeNull()
    expect(Math.round(s!.ratio)).toBe(52)
  })

  it("and the correct entries they should have been", () => {
    expect(stockPriceLooksWrong({ unitPrice: 112.08, existingAvgPrice: 112.08 })).toBeNull()
    expect(stockPriceLooksWrong({ unitPrice: 1400, existingAvgPrice: 1350 })).toBeNull()
  })
})

describe("it does not fire on prices that genuinely move", () => {
  it("allows fuel doubling in a year", () => {
    expect(stockPriceLooksWrong({ unitPrice: 224, existingAvgPrice: 112 })).toBeNull()
  })

  it("allows a fertiliser price tripling", () => {
    expect(stockPriceLooksWrong({ unitPrice: 4050, existingAvgPrice: 1350 })).toBeNull()
  })

  it("allows a tenfold move, which is already beyond anything an estate meets", () => {
    // Deliberately loose. This catches a category error, not a bad deal.
    expect(stockPriceLooksWrong({ unitPrice: 1120, existingAvgPrice: 112 })).toBeNull()
  })

  it("fires just past the stated multiple, and not just before it", () => {
    const avg = 100
    expect(stockPriceLooksWrong({ unitPrice: avg * STOCK_PRICE_SANITY_MULTIPLE, existingAvgPrice: avg })).toBeNull()
    expect(stockPriceLooksWrong({ unitPrice: avg * STOCK_PRICE_SANITY_MULTIPLE + 1, existingAvgPrice: avg })).not.toBeNull()
  })
})

describe("absence of history is not evidence of a mistake", () => {
  it("says nothing about the first restock of a brand new item", () => {
    // The guard must fire hardest on wrong input, not on input it has nothing to compare against.
    expect(stockPriceLooksWrong({ unitPrice: 4480, existingAvgPrice: 0 })).toBeNull()
  })

  it("says nothing when the price itself is zero — that is the other guard's job", () => {
    expect(stockPriceLooksWrong({ unitPrice: 0, existingAvgPrice: 112 })).toBeNull()
  })

  it("ignores values that are not numbers rather than guessing", () => {
    expect(stockPriceLooksWrong({ unitPrice: Number.NaN, existingAvgPrice: 112 })).toBeNull()
    expect(stockPriceLooksWrong({ unitPrice: 112, existingAvgPrice: Number.NaN })).toBeNull()
  })
})

describe("the mirror case: a price far too low", () => {
  it("catches a per-gram figure entered against a per-kg item", () => {
    const s = stockPriceLooksWrong({ unitPrice: 1.35, existingAvgPrice: 1350 })
    expect(s).not.toBeNull()
    expect(s!.direction).toBe("low")
    expect(Math.round(s!.ratio)).toBe(1000)
  })
})

describe("both write paths carry it, because an edit is the other way in", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8")

  it("the create path checks before writing", () => {
    const route = read("app/api/transactions-neon/route.ts")
    expect(route).toContain("stockPriceLooksWrong")
    expect(route).toMatch(/If you meant the total paid/)
  })

  it("the edit path checks too", () => {
    expect(read("app/api/transactions-neon/update/route.ts")).toContain("stockPriceLooksWrong")
  })

  it("the edit path excludes the row being edited from the comparison", () => {
    /**
     * THE TRAP THIS AVOIDS. Correcting HoneyFarm's Rs 4,480 petrol row is itself an edit. Measured
     * against an average that still includes the bad row, the correction back down to Rs 112 reads
     * as twenty times too cheap and gets refused — a guard that blocks the fix for the very thing
     * it guards against.
     */
    const route = read("app/api/transactions-neon/update/route.ts")
    expect(route).toMatch(/id <> \$\{Number\(id\)\}/)
    expect(route).toMatch(/transaction_type = 'restock'/)
  })

  it("only restocks are checked — a depletion is priced by the system, not typed", () => {
    // Positional rather than a fixed character window: the guard's body grows as it gains
    // comments, and a window measured in characters starts failing on documentation.
    for (const p of ["app/api/transactions-neon/route.ts", "app/api/transactions-neon/update/route.ts"]) {
      const src = read(p)
      const call = src.indexOf("stockPriceLooksWrong({")
      expect(call, `${p} never calls the guard`).toBeGreaterThan(-1)
      const gate = src.lastIndexOf('if (normalizedType === "restock")', call)
      expect(gate, `${p} calls the guard outside a restock-only branch`).toBeGreaterThan(-1)
    }
  })
})
