import { describe, expect, it } from "vitest"

import { buildWeeklySummaryText, formatAuditPayload, formatCount, formatDeltaText } from "../components/admin/utils"

describe("formatCount", () => {
  it("applies locale grouping for large numbers", () => {
    expect(formatCount(1234567)).toBe((1234567).toLocaleString())
  })

  it("treats undefined and zero as zero", () => {
    expect(formatCount(undefined as unknown as number)).toBe("0")
    expect(formatCount(0)).toBe("0")
  })

  it("handles negative numbers", () => {
    expect(formatCount(-42)).toBe((-42).toLocaleString())
  })
})

describe("formatDeltaText", () => {
  it("reports no change for a zero delta", () => {
    expect(formatDeltaText(0)).toBe("no change")
  })

  it("prefixes a positive delta with a plus sign", () => {
    expect(formatDeltaText(5)).toBe("+5")
  })

  it("prefixes a negative delta with a minus sign, using the absolute value", () => {
    expect(formatDeltaText(-5)).toBe("-5")
  })

  it("formats currency deltas using the currency formatter", () => {
    const positive = formatDeltaText(1000, true)
    const negative = formatDeltaText(-1000, true)
    expect(positive.startsWith("+")).toBe(true)
    expect(negative.startsWith("-")).toBe(true)
  })
})

describe("formatAuditPayload", () => {
  it("returns 'None' for a falsy payload", () => {
    expect(formatAuditPayload(null)).toBe("None")
    expect(formatAuditPayload(undefined)).toBe("None")
    expect(formatAuditPayload(0)).toBe("None")
    expect(formatAuditPayload("")).toBe("None")
  })

  it("pretty-prints a plain object", () => {
    expect(formatAuditPayload({ role: "admin" })).toBe(JSON.stringify({ role: "admin" }, null, 2))
  })

  it("falls back to String(payload) when JSON.stringify throws (circular reference)", () => {
    const circular: Record<string, unknown> = { name: "loop" }
    circular.self = circular
    expect(formatAuditPayload(circular)).toBe(String(circular))
  })
})

describe("buildWeeklySummaryText", () => {
  const baseSummary = {
    inventoryCount: 12,
    transactionCount: 40,
    processingCount: 8,
    dispatchCount: 3,
    salesCount: 5,
    salesRevenue: 50000,
    laborSpend: 12000,
    expenseSpend: 4000,
    receivablesOutstanding: 9000,
  }

  it("builds a summary without comparison deltas when no compare data is given", () => {
    const text = buildWeeklySummaryText(baseSummary as any, "Laxmi Estate", null, null, null)
    expect(text).toContain("FarmFlow Weekly Summary (Laxmi Estate)")
    expect(text).toContain("Range: last 7 days (7 days)")
    expect(text).not.toContain(" vs ")
  })

  it("includes comparison deltas when compare data is provided", () => {
    const compareSummary = { ...baseSummary, transactionCount: 30, salesRevenue: 40000 }
    const range = { startDate: "2026-07-22", endDate: "2026-07-28", totalDays: 7 }
    const compareRange = { startDate: "2026-07-15", endDate: "2026-07-21", totalDays: 7 }
    const text = buildWeeklySummaryText(baseSummary as any, "Laxmi Estate", range, compareSummary as any, compareRange)
    expect(text).toContain("Transactions (7d): 40 (+10 vs 2026-07-15 to 2026-07-21)")
    expect(text).toContain("vs 2026-07-15 to 2026-07-21")
  })

  it("uses the singular 'day' label for a single-day range", () => {
    const range = { startDate: "2026-07-28", endDate: "2026-07-28", totalDays: 1 }
    const text = buildWeeklySummaryText(baseSummary as any, "Laxmi Estate", range, null, null)
    expect(text).toContain("(1 day)")
  })
})
