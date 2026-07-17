import { formatCurrency, formatNumber } from "@/lib/format"
import type { Transaction } from "@/lib/inventory-types"
import { LOCATION_UNASSIGNED } from "@/components/inventory-system/constants"

export type ExecutionOutcomeStatus = "good" | "attention" | "blocked"

export type ExecutionOutcomeCheck = {
  id: string
  title: string
  goal: string
  metric: string
  status: ExecutionOutcomeStatus
  actionLabel: string
  actionTab: string
}

export type ExecutionOutcomeInput = {
  accountsTotals: { laborTotal: number; grandTotal: number }
  accountsTotalsLoading: boolean
  availableExportDatasetCount: number
  canShowAccounts: boolean
  canShowBalanceSheet: boolean
  canShowBilling: boolean
  canShowDispatch: boolean
  canShowInventory: boolean
  canShowProcessing: boolean
  canShowReceivables: boolean
  canShowSales: boolean
  canShowSeason: boolean
  processingTotals: { arabicaKg: number; robustaKg: number; loading: boolean }
  recentThirtyDayTransactions: Transaction[]
  showTransactionHistory: boolean
  visibleTabs: string[]
  locationCount: number
}

/**
 * Derives the Execution Scorecard rows from current estate state. Pure: it only reads the
 * input snapshot and returns rows, so it can be unit-tested without React.
 */
export function buildExecutionOutcomeChecks(input: ExecutionOutcomeInput): ExecutionOutcomeCheck[] {
  const {
    accountsTotals,
    accountsTotalsLoading,
    availableExportDatasetCount,
    canShowAccounts,
    canShowBalanceSheet,
    canShowBilling,
    canShowDispatch,
    canShowInventory,
    canShowProcessing,
    canShowReceivables,
    canShowSales,
    canShowSeason,
    processingTotals,
    recentThirtyDayTransactions,
    showTransactionHistory,
    visibleTabs,
    locationCount,
  } = input

  const pct = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : null)
  const pickActionTab = (preferredTabs: string[]) => preferredTabs.find((tab) => visibleTabs.includes(tab)) || "home"
  const multiLocation = locationCount > 1
  const hasTaggedLocation = (tx: Transaction) => {
    const locationId = String(tx.location_id || "").trim()
    return Boolean(locationId && locationId !== LOCATION_UNASSIGNED)
  }
  const hasNotes = (tx: Transaction) => String(tx.notes || "").trim().length > 0
  // Location tagging is only a required field when the estate has multiple locations.
  // Single-location estates have nothing to distinguish so we don't penalise them.
  const hasRequiredFields = (tx: Transaction) =>
    String(tx.item_type || "").trim().length > 0 &&
    Number(tx.quantity) > 0 &&
    String(tx.transaction_type || "").trim().length > 0 &&
    (!multiLocation || hasTaggedLocation(tx))

  const structuredTaskCount = recentThirtyDayTransactions.filter(hasRequiredFields).length
  const structuredTaskPct = pct(structuredTaskCount, recentThirtyDayTransactions.length)
  const missedFieldTaskStatus: ExecutionOutcomeStatus =
    recentThirtyDayTransactions.length === 0
      ? "attention"
      : (structuredTaskPct || 0) >= 95
        ? "good"
        : (structuredTaskPct || 0) >= 80
          ? "attention"
          : "blocked"

  const harvestKg = processingTotals.arabicaKg + processingTotals.robustaKg
  const harvestStatus: ExecutionOutcomeStatus =
    !canShowProcessing ? "blocked" : processingTotals.loading ? "attention" : harvestKg > 0 ? "good" : "attention"

  const depleteTransactions = recentThirtyDayTransactions.filter((tx) =>
    String(tx.transaction_type || "").toLowerCase().includes("deplet"),
  )
  const taggedDepleteTransactions = depleteTransactions.filter((tx) => hasTaggedLocation(tx) && Number(tx.quantity) > 0)
  const inputTrackingPct = pct(taggedDepleteTransactions.length, depleteTransactions.length)
  const inputTrackingStatus: ExecutionOutcomeStatus =
    !showTransactionHistory
      ? "blocked"
      : depleteTransactions.length === 0
        ? "attention"
        : !multiLocation
          ? "good"
          : (inputTrackingPct || 0) >= 90
            ? "good"
            : (inputTrackingPct || 0) >= 70
              ? "attention"
              : "blocked"

  const laborSharePct =
    accountsTotals.grandTotal > 0 ? Math.round((accountsTotals.laborTotal / accountsTotals.grandTotal) * 100) : null
  const laborVisibilityStatus: ExecutionOutcomeStatus =
    !canShowAccounts
      ? "blocked"
      : accountsTotalsLoading
        ? "attention"
        : accountsTotals.laborTotal > 0
          ? "good"
          : "attention"

  const notesCoveragePct = pct(
    recentThirtyDayTransactions.filter((tx) => hasNotes(tx)).length,
    recentThirtyDayTransactions.length,
  )
  const chaosReductionStatus: ExecutionOutcomeStatus =
    recentThirtyDayTransactions.length === 0
      ? "attention"
      : (notesCoveragePct || 0) >= 70 && availableExportDatasetCount >= 4
        ? "good"
        : (notesCoveragePct || 0) >= 45 && availableExportDatasetCount >= 3
          ? "attention"
          : "blocked"

  const ownerReportReady = canShowSeason && (canShowBalanceSheet || canShowAccounts)
  const exporterReportReady = canShowDispatch && canShowSales && (canShowBilling || canShowReceivables)
  const managerReportReady = canShowInventory && canShowProcessing && (canShowAccounts || showTransactionHistory)
  const audienceReadyCount = [ownerReportReady, exporterReportReady, managerReportReady].filter(Boolean).length
  const cleanerReportsStatus: ExecutionOutcomeStatus =
    audienceReadyCount >= 3 ? "good" : audienceReadyCount >= 2 ? "attention" : "blocked"

  return [
    {
      id: "missed-field-tasks",
      title: "Fewer Missed Field Tasks",
      goal: "Ensure field teams capture complete, location-tagged entries.",
      metric:
        recentThirtyDayTransactions.length === 0
          ? "No inventory tasks logged in last 30 days."
          : `${structuredTaskPct || 0}% of recent inventory tasks are complete`,
      status: missedFieldTaskStatus,
      actionLabel: "Open Transactions",
      actionTab: pickActionTab(["transactions", "inventory"]),
    },
    {
      id: "better-harvest-records",
      title: "Better Harvest Records",
      goal: "Track harvest and processing output consistently through the season.",
      metric: !canShowProcessing
        ? "Pulping module is disabled."
        : processingTotals.loading
          ? "Loading pulping totals..."
          : `${formatNumber(harvestKg, 0)} kg harvest output logged`,
      status: harvestStatus,
      actionLabel: "Open Pulping",
      actionTab: pickActionTab(["processing", "season"]),
    },
    {
      id: "input-usage-tracking",
      title: "Input Usage Tracking",
      goal: "Tie depleting usage to specific locations for accountability.",
      metric:
        depleteTransactions.length === 0
          ? "No depleting entries logged in last 30 days."
          : `${inputTrackingPct || 0}% of depleting entries are location-tagged`,
      status: inputTrackingStatus,
      actionLabel: "Open Inventory",
      actionTab: pickActionTab(["inventory", "transactions"]),
    },
    {
      id: "labour-visibility",
      title: "Labour Visibility",
      goal: "Keep labour spend visible for day-to-day decisions.",
      metric: !canShowAccounts
        ? "Accounts module is disabled."
        : accountsTotalsLoading
          ? "Loading labour totals..."
          : `${formatCurrency(accountsTotals.laborTotal, 0)} labour tracked${laborSharePct !== null ? ` (${laborSharePct}% of spend)` : ""}`,
      status: laborVisibilityStatus,
      actionLabel: "Open Accounts",
      actionTab: pickActionTab(["accounts", "balance-sheet"]),
    },
    {
      id: "less-chaos",
      title: "Structured Daily Updates",
      goal: "Keep updates recorded in FarmFlow with reusable exports.",
      metric:
        recentThirtyDayTransactions.length === 0
          ? `${availableExportDatasetCount} CSV exports ready for operations`
          : `${notesCoveragePct || 0}% entries include notes · ${availableExportDatasetCount} CSV exports ready`,
      status: chaosReductionStatus,
      actionLabel: "Open Dashboard",
      actionTab: "home",
    },
    {
      id: "cleaner-reports",
      title: "Reports for Owner, Exporter, and Manager",
      goal: "Ensure decision-ready views exist for each leadership role.",
      metric: `${audienceReadyCount}/3 role views covered (owner, exporter, manager)`,
      status: cleanerReportsStatus,
      actionLabel: "Open Season",
      actionTab: pickActionTab(["season", "accounts", "dispatch"]),
    },
  ]
}
