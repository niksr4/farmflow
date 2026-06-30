import { describe, expect, it } from "vitest"
import { aggregateLaborEntries, computeLaborTotalCost } from "../lib/labour-cost"

const reconstructedTotal = (b: ReturnType<typeof aggregateLaborEntries>) =>
  b.hfLaborers * b.hfCostPer + b.outsideLaborers * b.outsideCostPer

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

describe("aggregateLaborEntries — the HoneyFarm 'Robusta Weeding' bug", () => {
  it("captures plain in-house + outside unchanged", () => {
    const entries = [
      { name: "In-house", laborCount: 7, costPerLabor: 475 },
      { name: "Outside", laborCount: 2, costPerLabor: 450 },
    ]
    const result = aggregateLaborEntries(entries)
    expect(result).toEqual({ hfLaborers: 7, hfCostPer: 475, outsideLaborers: 2, outsideCostPer: 450 })
    expect(reconstructedTotal(result)).toBe(computeLaborTotalCost(entries))
  })

  it("folds a custom '+Add group' entry into outside instead of dropping it", () => {
    // This is the exact bug KAB reported: total_cost included the extra group,
    // but outside_laborers stayed 0 because "Group 3" didn't match the exact
    // name the old code looked for.
    const entries = [
      { name: "In-house", laborCount: 7, costPerLabor: 475 },
      { name: "Group 3", laborCount: 2, costPerLabor: 450 },
    ]
    const result = aggregateLaborEntries(entries)
    expect(result.outsideLaborers).toBe(2)
    expect(reconstructedTotal(result)).toBe(computeLaborTotalCost(entries))
  })

  it("blends two differently-rated outside-type groups into one bucket", () => {
    const entries = [
      { name: "In-house", laborCount: 7, costPerLabor: 475 },
      { name: "Outside", laborCount: 2, costPerLabor: 450 },
      { name: "Group 3", laborCount: 1, costPerLabor: 475 },
    ]
    const result = aggregateLaborEntries(entries)
    expect(result.outsideLaborers).toBe(3)
    expect(reconstructedTotal(result)).toBe(computeLaborTotalCost(entries))
  })

  it("a pure contract/lump-sum entry with zero headcount still reconciles", () => {
    // Raju gang: laborCount 0, contractTotal only — no real "per worker" rate,
    // but the dollar amount must still show up in hf + outside somewhere.
    const entries = [
      { name: "In-house", laborCount: 6, costPerLabor: 475 },
      { name: "Raju gang", laborCount: 0, costPerLabor: 0, contractTotal: 19350 },
    ]
    const result = aggregateLaborEntries(entries)
    expect(result.outsideLaborers).toBeGreaterThan(0)
    expect(reconstructedTotal(result)).toBe(computeLaborTotalCost(entries))
  })

  it("no outside-type entries at all leaves outside at zero", () => {
    const entries = [{ name: "In-house", laborCount: 4, costPerLabor: 475 }]
    const result = aggregateLaborEntries(entries)
    expect(result).toEqual({ hfLaborers: 4, hfCostPer: 475, outsideLaborers: 0, outsideCostPer: 0 })
  })

  it("recognizes legacy 'Estate Labor'/'Estate Labour' spellings as in-house", () => {
    expect(aggregateLaborEntries([{ name: "Estate Labor", laborCount: 5, costPerLabor: 475 }]).hfLaborers).toBe(5)
    expect(aggregateLaborEntries([{ name: "Estate Labour", laborCount: 5, costPerLabor: 475 }]).hfLaborers).toBe(5)
  })
})
