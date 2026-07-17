import { describe, it, expect } from "vitest"
import { hasSufficientStock, computeRemainingKgs, STOCK_EPSILON_KGS } from "@/lib/sales-math"

// These lock in the exact boolean semantics behind the C-3 oversell guard. The SQL guard in
// app/api/sales/route.ts mirrors this logic inside a locked transaction; this suite documents
// the boundary behavior that guard must uphold.
describe("oversell guard math (hasSufficientStock)", () => {
  it("allows a sale that exactly consumes remaining stock", () => {
    expect(hasSufficientStock(100, 40, 60)).toBe(true) // remaining 60, requesting 60
  })

  it("rejects a sale that exceeds remaining stock", () => {
    expect(hasSufficientStock(100, 40, 61)).toBe(false) // remaining 60, requesting 61
  })

  it("rejects any sale once stock is fully sold", () => {
    expect(hasSufficientStock(100, 100, 0.5)).toBe(false)
  })

  it("rejects a sale when nothing was ever received", () => {
    expect(hasSufficientStock(0, 0, 1)).toBe(false)
  })

  it("tolerates sub-gram floating point drift via epsilon", () => {
    // remaining is 60 but arithmetic yields 59.9999999; a 60kg request must still pass
    expect(hasSufficientStock(100.0000001, 40, 60)).toBe(true)
  })

  it("does not tolerate an overshoot larger than epsilon", () => {
    expect(hasSufficientStock(100, 40, 60 + STOCK_EPSILON_KGS * 10)).toBe(false)
  })

  it("coerces string inputs the way the DB rows arrive", () => {
    expect(hasSufficientStock("100", "40", "60")).toBe(true)
    expect(hasSufficientStock("100", "40", "60.01")).toBe(false)
  })

  it("computeRemainingKgs can be negative when data is already oversold", () => {
    // The guard must never let this happen going forward, but the math is honest about history.
    expect(computeRemainingKgs(50, 70)).toBe(-20)
    expect(hasSufficientStock(50, 70, 1)).toBe(false)
  })
})
