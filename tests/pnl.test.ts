import { describe, expect, it } from "vitest"

import { computeNetPnl } from "../lib/server/pnl"

describe("computeNetPnl", () => {
  it("sums both revenue sources and both outflow sources", () => {
    expect(
      computeNetPnl({ salesRevenue: 1000, otherSalesRevenue: 200, laborCost: 300, expenseCost: 150 }),
    ).toEqual({ totalRevenue: 1200, totalOutflow: 450, netMargin: 750 })
  })

  it("handles an all-zero period without error", () => {
    expect(
      computeNetPnl({ salesRevenue: 0, otherSalesRevenue: 0, laborCost: 0, expenseCost: 0 }),
    ).toEqual({ totalRevenue: 0, totalOutflow: 0, netMargin: 0 })
  })

  it("allows a negative net margin when outflow exceeds revenue", () => {
    expect(
      computeNetPnl({ salesRevenue: 100, otherSalesRevenue: 0, laborCost: 200, expenseCost: 50 }),
    ).toEqual({ totalRevenue: 100, totalOutflow: 250, netMargin: -150 })
  })
})
