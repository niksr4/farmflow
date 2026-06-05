import { describe, expect, it } from "vitest"
import { computeLaborTotalCost } from "../lib/labour-cost"

describe("computeLaborTotalCost — regular entries", () => {
  it("multiplies laborCount × costPerLabor for regular entry", () => {
    expect(computeLaborTotalCost([{ laborCount: 5, costPerLabor: 475 }])).toBe(2375)
  })

  it("sums multiple regular entries", () => {
    expect(computeLaborTotalCost([
      { laborCount: 4, costPerLabor: 475 },
      { laborCount: 6, costPerLabor: 400 },
    ])).toBe(4300)
  })

  it("handles half-day workers (0.5)", () => {
    expect(computeLaborTotalCost([{ laborCount: 0.5, costPerLabor: 475 }])).toBe(237.5)
  })

  it("returns 0 for zero workers", () => {
    expect(computeLaborTotalCost([{ laborCount: 0, costPerLabor: 475 }])).toBe(0)
  })
})

describe("computeLaborTotalCost — contract/lump-sum entries", () => {
  it("uses contractTotal for contract entry (NOT laborCount×rate)", () => {
    // This is the Raju gang bug: laborCount=0, costPerLabor=0, contractTotal=19350
    expect(computeLaborTotalCost([{ laborCount: 0, costPerLabor: 0, contractTotal: 19350 }])).toBe(19350)
  })

  it("contract entry with large amount", () => {
    expect(computeLaborTotalCost([{ name: "Raju gang", laborCount: 0, costPerLabor: 0, contractTotal: 34200 }])).toBe(34200)
  })

  it("does NOT double-count contractTotal + laborCount×rate", () => {
    // A contract entry has both zero — should just be contractTotal
    expect(computeLaborTotalCost([{ laborCount: 0, costPerLabor: 0, contractTotal: 15200 }])).toBe(15200)
  })
})

describe("computeLaborTotalCost — mixed entries", () => {
  it("sums regular and contract entries together", () => {
    expect(computeLaborTotalCost([
      { name: "In-house", laborCount: 8, costPerLabor: 475 },
      { name: "Raju gang", laborCount: 0, costPerLabor: 0, contractTotal: 19350 },
    ])).toBe(8 * 475 + 19350) // 3800 + 19350 = 23150
  })

  it("handles empty entries array", () => {
    expect(computeLaborTotalCost([])).toBe(0)
  })

  it("handles null/undefined fields gracefully", () => {
    expect(computeLaborTotalCost([{ laborCount: null, costPerLabor: null, contractTotal: null }])).toBe(0)
    expect(computeLaborTotalCost([{}])).toBe(0)
  })
})

describe("computeLaborTotalCost — data integrity", () => {
  it("three Raju gang entries sum correctly", () => {
    const entries = [
      { laborCount: 0, costPerLabor: 0, contractTotal: 19350 },
      { laborCount: 0, costPerLabor: 0, contractTotal: 24700 },
      { laborCount: 0, costPerLabor: 0, contractTotal: 34200 },
    ]
    expect(computeLaborTotalCost(entries)).toBe(78250)
  })

  it("HoneyFarm typical day: 6 workers @ 475 + 4 outside @ 450", () => {
    expect(computeLaborTotalCost([
      { name: "In-house", laborCount: 6, costPerLabor: 475 },
      { name: "Outside", laborCount: 4, costPerLabor: 450 },
    ])).toBe(6 * 475 + 4 * 450) // 2850 + 1800 = 4650
  })

  it("bonus/lump-sum payment via contractTotal", () => {
    expect(computeLaborTotalCost([{ laborCount: 0, costPerLabor: 0, contractTotal: 281000 }])).toBe(281000)
  })
})
