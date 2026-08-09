import { describe, expect, it } from "vitest"
import { buildEstateBreakdownSection, type EstateActivityBreakdown } from "../lib/server/agents/digest-estate-breakdown"

const estate = (overrides: Partial<EstateActivityBreakdown> = {}): EstateActivityBreakdown => ({
  estate: "Tirtha Estate",
  processingKg: 0,
  laborCost: 0,
  expenseTotal: 0,
  dispatchBags: 0,
  salesRevenue: 0,
  ...overrides,
})

describe("buildEstateBreakdownSection", () => {
  it("returns null for a single-estate breakdown -- nothing to break down", () => {
    expect(buildEstateBreakdownSection("Last Week — By Estate", [estate()])).toBeNull()
  })

  it("returns null for an empty breakdown", () => {
    expect(buildEstateBreakdownSection("Last Week — By Estate", [])).toBeNull()
  })

  it("renders a section with the given title for two or more estates", () => {
    const section = buildEstateBreakdownSection("Last Week — By Estate", [
      estate({ estate: "Tirtha Estate", laborCost: 103800 }),
      estate({ estate: "Citrus Grove" }),
    ])
    expect(section).not.toBeNull()
    expect(section).toContain("## Last Week — By Estate")
  })

  it("lists every estate passed in, in order, one line each", () => {
    const section = buildEstateBreakdownSection("Yesterday — By Estate", [
      estate({ estate: "Tirtha Estate", laborCost: 13800 }),
      estate({ estate: "Citrus Grove" }),
    ])!
    const lines = section.split("\n").filter((l) => l.startsWith("- "))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain("Tirtha Estate")
    expect(lines[1]).toContain("Citrus Grove")
  })

  it("says 'no activity recorded' for an estate with every metric at zero", () => {
    const section = buildEstateBreakdownSection("Last Week — By Estate", [
      estate({ estate: "Tirtha Estate", laborCost: 5000 }),
      estate({ estate: "Citrus Grove" }),
    ])!
    expect(section).toContain("- Citrus Grove: no activity recorded")
  })

  it("formats each non-zero metric with the correct label and currency/unit", () => {
    const section = buildEstateBreakdownSection("Last Week — By Estate", [
      estate({
        estate: "Tirtha Estate",
        processingKg: 120.5,
        laborCost: 13800,
        expenseTotal: 2500,
        dispatchBags: 8,
        salesRevenue: 45000,
      }),
      estate({ estate: "Citrus Grove" }),
    ])!
    const tirthaLine = section.split("\n").find((l) => l.startsWith("- Tirtha Estate"))!
    expect(tirthaLine).toContain("120.5 kg processed")
    expect(tirthaLine).toContain("₹13,800 labour")
    expect(tirthaLine).toContain("₹2,500 other expenses")
    expect(tirthaLine).toContain("8.0 bags dispatched")
    expect(tirthaLine).toContain("₹45,000 sales revenue")
  })

  it("omits zero-valued metrics from an otherwise-active estate's line instead of printing ₹0", () => {
    const section = buildEstateBreakdownSection("Last Week — By Estate", [
      estate({ estate: "Tirtha Estate", laborCost: 5000 }),
      estate({ estate: "Citrus Grove", processingKg: 40 }),
    ])!
    const tirthaLine = section.split("\n").find((l) => l.startsWith("- Tirtha Estate"))!
    expect(tirthaLine).not.toContain("kg processed")
    expect(tirthaLine).not.toContain("bags dispatched")
    expect(tirthaLine).toContain("₹5,000 labour")
  })

  it("supports three or more estates, not just exactly two", () => {
    const section = buildEstateBreakdownSection("Last Week — By Estate", [
      estate({ estate: "Estate A", laborCost: 1000 }),
      estate({ estate: "Estate B", laborCost: 2000 }),
      estate({ estate: "Estate C" }),
    ])!
    const lines = section.split("\n").filter((l) => l.startsWith("- "))
    expect(lines).toHaveLength(3)
  })

  it("includes a non-zero Unassigned bucket appended by the caller like any other estate", () => {
    // fetchActivityByEstate appends a non-zero "Unassigned" bucket after named estates --
    // buildEstateBreakdownSection just renders whatever list it's given, in order.
    const section = buildEstateBreakdownSection("Last Week — By Estate", [
      estate({ estate: "Tirtha Estate", laborCost: 1000 }),
      estate({ estate: "Citrus Grove", laborCost: 2000 }),
      estate({ estate: "Unassigned", expenseTotal: 500 }),
    ])!
    expect(section).toContain("- Unassigned: ₹500 other expenses")
  })
})
