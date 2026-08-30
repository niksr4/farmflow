import { describe, expect, it } from "vitest"

import { isExpenseOriginatedDepletion, isRevaluationDepletion, shouldSkipStockLoss } from "../lib/stock-loss"

/**
 * HoneyFarm, 2026-08-29. Three attempts to correct one calcium-nitrate price produced three
 * stock-loss expenses totalling Rs 105.64 crore against an estate whose real annual costs are
 * about Rs 36 lakh. A price correction is written as deplete-then-restock of the same quantity;
 * nothing leaves the shed, but the deplete half looked like any other depletion and was expensed
 * at full value. Each retry compounded it, because each correction depleted at the previous
 * (already wrong) price.
 */
describe("a revaluation never books a cost line", () => {
  it("skips the exact notes that cost HoneyFarm Rs 105 crore", () => {
    expect(shouldSkipStockLoss("Price correction (₹1,26,569.46 -> ₹1,97,525.00 per kg)")).toBe(true)
    expect(shouldSkipStockLoss("Price correction (₹1,97,525 -> ₹6.60 per kg)")).toBe(true)
    expect(shouldSkipStockLoss("Price correction (₹6.60 -> ₹60.60 per kg)")).toBe(true)
  })

  it("covers the older spelling too", () => {
    // Existing rows carry "Price updated from ... to ...", which the season summary already excludes.
    expect(isRevaluationDepletion("Price updated from ₹0.00 to ₹120.00.")).toBe(true)
  })

  it("still books a genuine loss", () => {
    // The whole point of code 124: stock that left and cost real money.
    expect(shouldSkipStockLoss("Arabica spray")).toBe(false)
    expect(shouldSkipStockLoss("Spilt in the shed")).toBe(false)
    expect(shouldSkipStockLoss(null)).toBe(false)
    expect(shouldSkipStockLoss("")).toBe(false)
  })

  it("keeps skipping expense-originated depletions", () => {
    // The other half of the loop, unchanged.
    expect(isExpenseOriginatedDepletion("Used on block A [expense_id:412]")).toBe(true)
    expect(shouldSkipStockLoss("Used on block A [expense_id:412]")).toBe(true)
  })

  it("does not skip a note that merely mentions a price", () => {
    // Anchored at the start: a real loss whose note happens to discuss price must still be booked.
    expect(shouldSkipStockLoss("Damaged bags, price was ₹70/kg")).toBe(false)
  })
})
