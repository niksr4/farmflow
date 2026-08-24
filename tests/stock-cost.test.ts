import { describe, expect, it } from "vitest"
import { hasStockCost, resolveStockCost } from "@/lib/stock-cost"

/**
 * Stock is priced by what the invoice says was paid, not by a per-unit rate worked out in someone's
 * head. replayInventoryLedger rebuilds the weighted average from `quantity` and `total_cost` and
 * never reads the per-unit column -- so total_cost is the number every costed depletion rests on,
 * and the forms used to collect the rounded figure and compute the authoritative one from it.
 */
describe("a total is taken at face value", () => {
  it("records exactly what was paid", () => {
    expect(resolveStockCost({ quantity: 50, totalPrice: 3000 }).totalCost).toBe(3000)
  })

  it("derives the rate without rounding it", () => {
    // Rs 1,000 for 3 kg is Rs 333.333.../kg. Asking a person for that rate is how total_cost
    // became Rs 999 and every later depletion was costed fractionally low, forever.
    const cost = resolveStockCost({ quantity: 3, totalPrice: 1000 })
    expect(cost.totalCost).toBe(1000)
    expect(cost.unitPrice).toBeCloseTo(333.3333, 4)
  })

  it("does not divide by zero", () => {
    const cost = resolveStockCost({ quantity: 0, totalPrice: 500 })
    expect(cost.unitPrice).toBe(0)
    // The total is still recorded truthfully; only the derived rate is undefined.
    expect(cost.totalCost).toBe(500)
  })
})

describe("a unit price still works, because the rollout is not atomic", () => {
  /**
   * Some callers legitimately send a rate: the revalue path computes one from the running average
   * rather than asking anyone. A route that only understood totals would reject those, and one
   * that ignored the unknown field would store a zero-cost restock -- the exact corruption the
   * price rules exist to prevent.
   */
  it("multiplies out when only a rate is given", () => {
    expect(resolveStockCost({ quantity: 50, unitPrice: 60 })).toEqual({ totalCost: 3000, unitPrice: 60 })
  })

  it("prefers the total when both arrive", () => {
    const cost = resolveStockCost({ quantity: 10, totalPrice: 1000, unitPrice: 60 })
    expect(cost.totalCost).toBe(1000)
    expect(cost.unitPrice).toBe(100)
  })
})

describe("zero cost is refused, whichever field it came in", () => {
  it("catches an empty total", () => {
    expect(hasStockCost(resolveStockCost({ quantity: 50, totalPrice: 0 }))).toBe(false)
  })

  it("catches an empty rate", () => {
    expect(hasStockCost(resolveStockCost({ quantity: 50, unitPrice: 0 }))).toBe(false)
  })

  it("catches junk rather than treating it as a number", () => {
    expect(hasStockCost(resolveStockCost({ quantity: 50, totalPrice: "abc" }))).toBe(false)
    expect(resolveStockCost({ quantity: 50, totalPrice: Number.NaN }).totalCost).toBe(0)
  })

  it("accepts a real one", () => {
    expect(hasStockCost(resolveStockCost({ quantity: 50, totalPrice: 3000 }))).toBe(true)
  })
})

describe("money is held to the paisa", () => {
  it("rounds the stored total", () => {
    // 3 x 33.333 = 99.999, which is not a sum of money.
    expect(resolveStockCost({ quantity: 3, unitPrice: 33.333 }).totalCost).toBe(100)
  })

  it("leaves the derived rate unrounded", () => {
    // Rounding it here would reintroduce exactly the drift that asking for a total removed.
    expect(resolveStockCost({ quantity: 7, totalPrice: 100 }).unitPrice).toBeCloseTo(14.285714, 6)
  })
})
