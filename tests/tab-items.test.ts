import { describe, expect, it } from "vitest"
import { buildDashboardTabItems, type DashboardTabItemsInput } from "@/components/inventory-system/tab-items"

const DummyIcon = () => null

const baseInput: DashboardTabItemsInput = {
  canShowAttendance: false,
  canShowAccounts: false,
  canShowProcessingWorkspace: false,
  processingWorkspaceLabel: "Pulping",
  processingWorkspaceIcon: DummyIcon,
  canShowProcessing: false,
  canShowPepper: false,
  canShowCuring: false,
  canShowQuality: false,
  canShowDispatch: false,
  canShowSalesWorkspace: false,
  canShowSales: false,
  canShowOtherSales: false,
  canShowInventoryWorkspace: false,
  showTransactionHistory: false,
  canShowRainfallSection: false,
  canShowRainfall: false,
  canShowWeather: false,
  canShowBalanceSheet: false,
  canShowSeasonPl: false,
  canShowReceivables: false,
  canShowBilling: false,
  canShowSeason: false,
  canShowYieldForecast: false,
  canShowPlantHealth: false,
  canShowAiAnalysis: false,
  canShowNews: false,
  canShowDocuments: false,
  canShowJournal: false,
  canShowResources: false,
  canShowActivityLog: false,
}

describe("buildDashboardTabItems", () => {
  it("returns empty operations and insights lists when every module is disabled", () => {
    const { operations, insights } = buildDashboardTabItems(baseInput)
    expect(operations).toHaveLength(0)
    expect(insights).toHaveLength(0)
  })

  it("only includes the sales subtabs for the modules that are actually enabled", () => {
    const onlyCoffee = buildDashboardTabItems({ ...baseInput, canShowSalesWorkspace: true, canShowSales: true, canShowOtherSales: false })
    expect(onlyCoffee.operations.find((t) => t.value === "sales")?.subtabs).toEqual(["Coffee Sales"])

    const onlyOther = buildDashboardTabItems({ ...baseInput, canShowSalesWorkspace: true, canShowSales: false, canShowOtherSales: true })
    expect(onlyOther.operations.find((t) => t.value === "sales")?.subtabs).toEqual(["Other Sales"])

    const both = buildDashboardTabItems({ ...baseInput, canShowSalesWorkspace: true, canShowSales: true, canShowOtherSales: true })
    expect(both.operations.find((t) => t.value === "sales")?.subtabs).toEqual(["Coffee Sales", "Other Sales"])
  })

  it("only shows the Transaction History inventory subtab when transaction history is enabled", () => {
    const withHistory = buildDashboardTabItems({ ...baseInput, canShowInventoryWorkspace: true, showTransactionHistory: true })
    expect(withHistory.operations.find((t) => t.value === "inventory")?.subtabs).toEqual(["Stock Levels", "Transaction History"])

    const withoutHistory = buildDashboardTabItems({ ...baseInput, canShowInventoryWorkspace: true, showTransactionHistory: false })
    expect(withoutHistory.operations.find((t) => t.value === "inventory")?.subtabs).toEqual(["Stock Levels"])
  })

  it("builds the processing subtabs from exactly which crops are enabled", () => {
    const { operations } = buildDashboardTabItems({
      ...baseInput,
      canShowProcessingWorkspace: true,
      canShowProcessing: true,
      canShowPepper: true,
    })
    expect(operations.find((t) => t.value === "processing")?.subtabs).toEqual(["Coffee Pulping", "Pepper Processing"])
  })

  it("resolves the rainfall subtabs across all three rainfall/weather combinations", () => {
    const rainOnly = buildDashboardTabItems({ ...baseInput, canShowRainfallSection: true, canShowRainfall: true, canShowWeather: false })
    expect(rainOnly.operations.find((t) => t.value === "rainfall")?.subtabs).toEqual(["Rainfall Logs"])

    const weatherOnly = buildDashboardTabItems({ ...baseInput, canShowRainfallSection: true, canShowRainfall: false, canShowWeather: true })
    expect(weatherOnly.operations.find((t) => t.value === "rainfall")?.subtabs).toEqual(["Forecast", "Estate Coordinates"])

    const both = buildDashboardTabItems({ ...baseInput, canShowRainfallSection: true, canShowRainfall: true, canShowWeather: true })
    expect(both.operations.find((t) => t.value === "rainfall")?.subtabs).toEqual(["Rainfall Logs", "Forecast"])
  })

  it("preserves the fixed insights ordering regardless of input key order", () => {
    const { insights } = buildDashboardTabItems({
      ...baseInput,
      canShowActivityLog: true,
      canShowBalanceSheet: true,
      canShowNews: true,
    })
    expect(insights.map((t) => t.value)).toEqual(["balance-sheet", "news", "activity-log"])
  })

  it("uses the tenant-configured processing workspace label and icon verbatim", () => {
    const { operations } = buildDashboardTabItems({
      ...baseInput,
      canShowProcessingWorkspace: true,
      processingWorkspaceLabel: "Pepper & Coffee",
    })
    const processingTab = operations.find((t) => t.value === "processing")
    expect(processingTab?.label).toBe("Pepper & Coffee")
    expect(processingTab?.icon).toBe(DummyIcon)
  })
})
