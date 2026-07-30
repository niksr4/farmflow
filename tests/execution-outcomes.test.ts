import { describe, expect, it } from "vitest"
import { buildExecutionOutcomeChecks, type ExecutionOutcomeInput } from "@/components/inventory-system/execution-outcomes"
import { LOCATION_UNASSIGNED } from "@/components/inventory-system/constants"
import type { Transaction } from "@/lib/inventory-types"

const baseTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  item_type: "MOP",
  quantity: 10,
  transaction_type: "deplete",
  user_id: "tester",
  location_id: "loc-1",
  notes: "",
  ...overrides,
})

const baseInput: ExecutionOutcomeInput = {
  accountsTotals: { laborTotal: 0, grandTotal: 0 },
  accountsTotalsLoading: false,
  availableExportDatasetCount: 0,
  canShowAccounts: false,
  canShowBalanceSheet: false,
  canShowBilling: false,
  canShowDispatch: false,
  canShowInventory: false,
  canShowProcessing: false,
  canShowReceivables: false,
  canShowSales: false,
  canShowSeason: false,
  processingTotals: { arabicaKg: 0, robustaKg: 0, loading: false },
  recentThirtyDayTransactions: [],
  showTransactionHistory: false,
  visibleTabs: [],
  locationCount: 1,
}

describe("buildExecutionOutcomeChecks", () => {
  it("returns exactly six checks with stable ids", () => {
    const checks = buildExecutionOutcomeChecks(baseInput)
    expect(checks).toHaveLength(6)
    expect(checks.map((c) => c.id)).toEqual([
      "missed-field-tasks",
      "better-harvest-records",
      "input-usage-tracking",
      "labour-visibility",
      "less-chaos",
      "cleaner-reports",
    ])
  })

  it("flags missed-field-tasks as 'attention' when there are zero recent transactions", () => {
    const checks = buildExecutionOutcomeChecks({ ...baseInput, recentThirtyDayTransactions: [] })
    const check = checks.find((c) => c.id === "missed-field-tasks")!
    expect(check.status).toBe("attention")
    expect(check.metric).toMatch(/no inventory tasks/i)
  })

  it("requires location tagging only when the estate has more than one location", () => {
    const untaggedTx = baseTx({ location_id: null })

    // Single-location estate: an untagged transaction still counts as "complete".
    const singleLocation = buildExecutionOutcomeChecks({
      ...baseInput,
      locationCount: 1,
      recentThirtyDayTransactions: [untaggedTx],
    })
    expect(singleLocation.find((c) => c.id === "missed-field-tasks")!.status).toBe("good")

    // Multi-location estate: the same untagged transaction now counts as incomplete,
    // dropping structuredTaskPct to 0% (< 80% => "blocked").
    const multiLocation = buildExecutionOutcomeChecks({
      ...baseInput,
      locationCount: 2,
      recentThirtyDayTransactions: [untaggedTx],
    })
    expect(multiLocation.find((c) => c.id === "missed-field-tasks")!.status).toBe("blocked")
  })

  it("treats LOCATION_UNASSIGNED the same as a missing location for tagging purposes", () => {
    const checks = buildExecutionOutcomeChecks({
      ...baseInput,
      locationCount: 2,
      recentThirtyDayTransactions: [baseTx({ location_id: LOCATION_UNASSIGNED })],
    })
    expect(checks.find((c) => c.id === "missed-field-tasks")!.status).toBe("blocked")
  })

  it("computes missed-field-tasks status at the 95% and 80% boundaries", () => {
    const makeTxns = (completeCount: number, incompleteCount: number) => [
      ...Array.from({ length: completeCount }, () => baseTx()),
      ...Array.from({ length: incompleteCount }, () => baseTx({ quantity: 0 })),
    ]

    // 19/20 = 95% exactly -> "good"
    const at95 = buildExecutionOutcomeChecks({
      ...baseInput,
      locationCount: 1,
      recentThirtyDayTransactions: makeTxns(19, 1),
    })
    expect(at95.find((c) => c.id === "missed-field-tasks")!.status).toBe("good")

    // 17/20 = 85% -> "attention" (>= 80, < 95)
    const at85 = buildExecutionOutcomeChecks({
      ...baseInput,
      locationCount: 1,
      recentThirtyDayTransactions: makeTxns(17, 3),
    })
    expect(at85.find((c) => c.id === "missed-field-tasks")!.status).toBe("attention")

    // 7/10 = 70% -> "blocked" (< 80)
    const at70 = buildExecutionOutcomeChecks({
      ...baseInput,
      locationCount: 1,
      recentThirtyDayTransactions: makeTxns(7, 3),
    })
    expect(at70.find((c) => c.id === "missed-field-tasks")!.status).toBe("blocked")
  })

  it("marks better-harvest-records as blocked when processing is disabled, regardless of totals", () => {
    const checks = buildExecutionOutcomeChecks({
      ...baseInput,
      canShowProcessing: false,
      processingTotals: { arabicaKg: 500, robustaKg: 500, loading: false },
    })
    expect(checks.find((c) => c.id === "better-harvest-records")!.status).toBe("blocked")
  })

  it("marks better-harvest-records as attention while totals are loading, then good once loaded with output", () => {
    const loading = buildExecutionOutcomeChecks({
      ...baseInput,
      canShowProcessing: true,
      processingTotals: { arabicaKg: 0, robustaKg: 0, loading: true },
    })
    expect(loading.find((c) => c.id === "better-harvest-records")!.status).toBe("attention")

    const loaded = buildExecutionOutcomeChecks({
      ...baseInput,
      canShowProcessing: true,
      processingTotals: { arabicaKg: 100, robustaKg: 0, loading: false },
    })
    expect(loaded.find((c) => c.id === "better-harvest-records")!.status).toBe("good")
  })

  it("computes input-usage-tracking only from depleting transactions, ignoring restocks", () => {
    const restock = baseTx({ transaction_type: "restock", location_id: null })
    const taggedDeplete = baseTx({ transaction_type: "deplete", location_id: "loc-1", quantity: 5 })

    const checks = buildExecutionOutcomeChecks({
      ...baseInput,
      showTransactionHistory: true,
      locationCount: 2,
      recentThirtyDayTransactions: [restock, taggedDeplete],
    })
    // Only 1 deplete transaction, fully tagged -> 100% -> "good", unaffected by the
    // untagged restock which should not be counted as a "depleting" entry at all.
    expect(checks.find((c) => c.id === "input-usage-tracking")!.status).toBe("good")
  })

  it("skips the multi-location tagging requirement for input-usage-tracking on single-location estates", () => {
    const untaggedDeplete = baseTx({ transaction_type: "deplete", location_id: null, quantity: 5 })
    const checks = buildExecutionOutcomeChecks({
      ...baseInput,
      showTransactionHistory: true,
      locationCount: 1,
      recentThirtyDayTransactions: [untaggedDeplete],
    })
    expect(checks.find((c) => c.id === "input-usage-tracking")!.status).toBe("good")
  })

  it("marks labour-visibility as blocked when accounts module is disabled", () => {
    const checks = buildExecutionOutcomeChecks({
      ...baseInput,
      canShowAccounts: false,
      accountsTotals: { laborTotal: 5000, grandTotal: 10000 },
    })
    expect(checks.find((c) => c.id === "labour-visibility")!.status).toBe("blocked")
  })

  it("computes less-chaos status from notes coverage and export dataset count together", () => {
    const withNotes = (count: number) => Array.from({ length: count }, () => baseTx({ notes: "context" }))

    // 100% notes coverage but only 2 export datasets -> falls short of the "good" gate (needs >= 4)
    // and also short of "attention" gate (needs >= 3), so it lands on "blocked".
    const lowExports = buildExecutionOutcomeChecks({
      ...baseInput,
      availableExportDatasetCount: 2,
      recentThirtyDayTransactions: withNotes(5),
    })
    expect(lowExports.find((c) => c.id === "less-chaos")!.status).toBe("blocked")

    // 100% notes coverage and 4 export datasets -> "good"
    const highExports = buildExecutionOutcomeChecks({
      ...baseInput,
      availableExportDatasetCount: 4,
      recentThirtyDayTransactions: withNotes(5),
    })
    expect(highExports.find((c) => c.id === "less-chaos")!.status).toBe("good")
  })

  it("computes cleaner-reports readiness across owner, exporter, and manager audiences", () => {
    const allReady = buildExecutionOutcomeChecks({
      ...baseInput,
      canShowSeason: true,
      canShowBalanceSheet: true,
      canShowAccounts: true,
      canShowDispatch: true,
      canShowSales: true,
      canShowBilling: true,
      canShowReceivables: true,
      canShowInventory: true,
      canShowProcessing: true,
      showTransactionHistory: true,
    })
    const check = allReady.find((c) => c.id === "cleaner-reports")!
    expect(check.status).toBe("good")
    expect(check.metric).toBe("3/3 role views covered (owner, exporter, manager)")

    const noneReady = buildExecutionOutcomeChecks(baseInput)
    expect(noneReady.find((c) => c.id === "cleaner-reports")!.status).toBe("blocked")
  })

  it("picks the first visible tab from the preferred list, falling back to 'home'", () => {
    const withVisibleTab = buildExecutionOutcomeChecks({
      ...baseInput,
      visibleTabs: ["inventory"],
    })
    // "input-usage-tracking" prefers ["inventory", "transactions"] — "inventory" is visible.
    expect(withVisibleTab.find((c) => c.id === "input-usage-tracking")!.actionTab).toBe("inventory")

    const withNoVisibleTabs = buildExecutionOutcomeChecks({
      ...baseInput,
      visibleTabs: [],
    })
    expect(withNoVisibleTabs.find((c) => c.id === "input-usage-tracking")!.actionTab).toBe("home")
  })
})
