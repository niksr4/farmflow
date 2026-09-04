import { describe, expect, it } from "vitest"

import { buildHistoricalBaselineContext, type WeeklyMetrics } from "../lib/server/tenant-weekly-metrics"

type HistoryInput = Omit<WeeklyMetrics, "tenantId" | "weekStart"> & { weeksSinceNow: number }

const week = (overrides: Partial<HistoryInput> = {}): HistoryInput & { weekStart: string; tenantId: string } => ({
  tenantId: "t1",
  weekStart: "2026-01-01",
  cherryKg: 0,
  processingDays: 0,
  parchmentBags: 0,
  laborEntries: 0,
  laborWorkerDays: 0,
  laborCost: 0,
  expenseTotal: 0,
  expenseEntries: 0,
  rainfallInches: 0,
  dispatchBags: 0,
  salesRevenue: 0,
  pickingEntries: 0,
  weeksSinceNow: 1,
  ...overrides,
})

const currentOf = (h: ReturnType<typeof week>): Omit<WeeklyMetrics, "tenantId" | "weekStart"> => {
  const { tenantId, weekStart, weeksSinceNow, ...rest } = h
  return rest
}

describe("buildHistoricalBaselineContext", () => {
  it("returns the no-history message when there are zero prior weeks", () => {
    const text = buildHistoricalBaselineContext([], currentOf(week()))
    expect(text).toContain("No prior weeks recorded yet")
    expect(text).toContain("Generic benchmarks apply")
  })

  it("summarizes processing activity, including inactive weeks in the denominator", () => {
    const history = [
      week({ cherryKg: 100, processingDays: 2 }),
      week({ cherryKg: 300, processingDays: 3 }),
      week({ cherryKg: 0, processingDays: 0 }), // an inactive week still counts toward "tracked"
    ]
    const current = currentOf(week({ cherryKg: 200 }))
    const text = buildHistoricalBaselineContext(history, current)

    expect(text).toContain("2 active weeks out of 3 tracked")
    // avg of the two active weeks (100, 300) is 200
    expect(text).toContain("avg 200 kg (range 100–300 kg)")
    expect(text).toContain("This week: 200 kg")
  })

  it("labels the percentage deviation with a sign and direction", () => {
    const history = [week({ cherryKg: 100, processingDays: 1 })]
    const above = buildHistoricalBaselineContext(history, currentOf(week({ cherryKg: 150 })))
    expect(above).toContain("(+50% vs your avg)")

    const below = buildHistoricalBaselineContext(history, currentOf(week({ cherryKg: 50 })))
    expect(below).toContain("(-50% vs your avg)")
  })

  it("omits the percentage entirely when the historical average is zero", () => {
    // baseline() filters to values > 0, so an all-zero history has no baseline and the
    // processing section is skipped outright (current.cherryKg is also 0 here).
    const history = [week({ cherryKg: 0, processingDays: 0 })]
    const text = buildHistoricalBaselineContext(history, currentOf(week({ cherryKg: 0 })))
    expect(text).not.toContain("Processing:")
  })

  it("computes cost-per-worker-day only when both labour cost and worker-day baselines exist", () => {
    const history = [
      week({ laborCost: 1000, laborWorkerDays: 10 }), // 100/day
      week({ laborCost: 2000, laborWorkerDays: 10 }), // 200/day
    ]
    const text = buildHistoricalBaselineContext(history, currentOf(week({ laborCost: 1500, laborWorkerDays: 10 })))
    expect(text).toContain("Labour cost/week: avg ₹1,500")
    expect(text).toContain("Cost per worker-day: avg ₹150")
    expect(text).toContain("this week ₹150")
  })

  it("skips the cost-per-worker-day line when no historical week has worker-days", () => {
    const history = [week({ laborCost: 1000, laborWorkerDays: 0 })]
    const text = buildHistoricalBaselineContext(history, currentOf(week({ laborCost: 1000 })))
    expect(text).toContain("Labour cost/week")
    expect(text).not.toContain("Cost per worker-day")
  })

  it("includes an expense baseline line only when there is expense history or a current figure", () => {
    const withHistory = buildHistoricalBaselineContext(
      [week({ expenseTotal: 500 })],
      currentOf(week({ expenseTotal: 600 })),
    )
    expect(withHistory).toContain("Other expenses/week: avg ₹500")

    const withoutEither = buildHistoricalBaselineContext([week({ expenseTotal: 0 })], currentOf(week({ expenseTotal: 0 })))
    expect(withoutEither).not.toContain("Other expenses/week")
  })

  it("reports rainfall even when there is no rain this week", () => {
    const text = buildHistoricalBaselineContext([week({ rainfallInches: 2 })], currentOf(week({ rainfallInches: 0 })))
    expect(text).toContain("Rainfall: avg 2.00 inches/week")
    expect(text).toContain("none this week")
  })

  it("counts active sales weeks out of total tracked weeks", () => {
    const history = [
      week({ salesRevenue: 1000 }),
      week({ salesRevenue: 0 }),
      week({ salesRevenue: 3000 }),
    ]
    const text = buildHistoricalBaselineContext(history, currentOf(week({ salesRevenue: 0 })))
    expect(text).toContain("Sales weeks: 2 of 3")
    expect(text).toContain("avg ₹2,000 on active sale weeks")
  })

  it("always ends with the deviation-flagging instruction when there is history", () => {
    const text = buildHistoricalBaselineContext([week({ cherryKg: 10 })], currentOf(week()))
    expect(text).toContain("When this week's figures deviate significantly from these estate averages")
  })
})
