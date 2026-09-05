import { describe, expect, it } from "vitest"
import { buildHeroContent, type BuildHeroContentParams } from "../lib/workspace-hero-content"

const moduleTotals = () => ({ loading: false, error: false as boolean | string | null })

const baseParams = (overrides: Partial<BuildHeroContentParams> = {}): BuildHeroContentParams => ({
  activeTab: "home",
  resolvedInventoryValue: 0,
  resolvedInventoryValueCaveat: null,
  resolvedProcessingWorkspaceView: "coffee",
  canShowPepper: false,
  enabledModuleIds: new Set<string>(),
  currentFiscalYearLabel: "FY2026",
  bagWeightLabel: "Standard bag weight: 50 kg",
  bagWeightValue: 50,
  recentActivityLabel: "24h activity: 0",
  unassignedLabel: "Unassigned moves: 0",
  loading: false,
  accountsTotalsLoading: false,
  estateMetrics: { locationCount: 0, recentActivity: 0 },
  unassignedTransactions: 0,
  totalTransactions: 0,
  exceptionsSummary: { count: 0 },
  filteredInventoryTotals: { totalQuantity: 0, unitLabel: "kg" },
  accountsTotals: { grandTotal: 0, laborTotal: 0, otherTotal: 0 },
  processingTotals: { loading: false, arabicaKg: 0, arabicaBags: 0, robustaKg: 0, robustaBags: 0 },
  dispatchHeroTotals: { ...moduleTotals(), arabicaKgs: 0, arabicaBags: 0, robustaKgs: 0, robustaBags: 0, totalDispatches: 0 },
  salesHeroTotals: { ...moduleTotals(), arabicaKgs: 0, arabicaBags: 0, robustaKgs: 0, robustaBags: 0, totalRevenue: 0, totalSales: 0 },
  otherSalesHeroTotals: { ...moduleTotals(), totalRevenue: 0 },
  curingHeroTotals: { ...moduleTotals(), totalOutputKg: 0, avgDryingDays: 0, avgMoistureDrop: 0, totalRecords: 0 },
  qualityHeroTotals: { ...moduleTotals(), avgCupScore: 0, avgDefects: 0, avgOutturnPct: 0, totalRecords: 0 },
  pepperHeroTotals: { ...moduleTotals(), totalPickedKg: 0, totalDryKg: 0, avgDryPercent: 0, totalRecords: 0 },
  rainfallHeroTotals: { ...moduleTotals(), totalInches: 0, totalRecords: 0, latestDate: null },
  receivablesHeroTotals: { ...moduleTotals(), totalCount: 0, totalInvoiced: 0, totalOutstanding: 0, totalOverdue: 0 },
  ...overrides,
})

describe("buildHeroContent", () => {
  it("returns the home screen content by default", () => {
    const content = buildHeroContent(baseParams())
    expect(content.badge).toBe("Home Screen")
    expect(content.stats).toHaveLength(2)
  })

  it("falls back to Estate Pulse for an unknown tab", () => {
    const content = buildHeroContent(baseParams({ activeTab: "not-a-real-tab" }))
    expect(content.badge).toBe("Estate Pulse")
  })

  // Regression test for the 2026-09-05 fix: "Latest rain log" renders a formatted date
  // string, not a count, so it must never carry a numeric metricValue -- doing so (it
  // previously duplicated rainfallHeroTotals.totalRecords, a copy-paste from the stat
  // above it) makes the "hide empty metrics" filter treat a real logged date as if it
  // were an empty/zero metric whenever the record count itself happens to be 0.
  it("gives the rainfall tab's 'Latest rain log' stat and chip a null metricValue, not the record count", () => {
    const content = buildHeroContent(
      baseParams({
        activeTab: "rainfall",
        enabledModuleIds: new Set(["rainfall"]),
        rainfallHeroTotals: {
          loading: false,
          error: false,
          totalInches: 4.5,
          totalRecords: 12,
          latestDate: "2026-09-01",
        },
      }),
    )
    const latestStat = content.stats.find((s) => s.label === "Latest rain log")
    expect(latestStat).toBeDefined()
    expect(latestStat?.metricValue).toBeNull()

    const latestChip = content.chips.find((c) => c.label.startsWith("Latest log:"))
    expect(latestChip).toBeDefined()
    expect(latestChip?.metricValue).toBeNull()
  })

  it("shows the non-rainfall weather chips/stats when the rainfall module is disabled", () => {
    const content = buildHeroContent(baseParams({ activeTab: "rainfall", enabledModuleIds: new Set() }))
    expect(content.stats.some((s) => s.label === "Forecast horizon")).toBe(true)
  })
})
