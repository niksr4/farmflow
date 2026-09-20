import { DEFAULT_DASHBOARD_TAB_PRIORITY } from "./constants"

/**
 * Where a click lands.
 *
 * Every function here answers "which tab does this go to?" and every one of them can be wrong
 * without anything failing: a bad answer navigates somewhere plausible, so the user assumes they
 * misread the card rather than that the routing is broken. Nothing throws, nothing logs, and the
 * only symptom is someone quietly not trusting the insight cards.
 *
 * Lifted out of components/inventory-system.tsx, where they were three useCallbacks in the middle
 * of a five-thousand-line component and had no tests.
 */

/**
 * Which tab visibility is gated on. The caller passes what the current user can actually see, so
 * every function here degrades to a tab that exists rather than routing into a blank gate.
 */
export type TabVisibility = {
  canShowAccounts: boolean
  canShowDispatch: boolean
  canShowProcessing: boolean
  canShowReceivables: boolean
  canShowSalesWorkspace: boolean
  canShowSeason: boolean
  showTransactionHistory: boolean
}

/**
 * The first tab in the house priority order that this user can actually see.
 *
 * Falls back to `tabs[0]` — whatever is visible beats nothing at all, even if it is not a tab the
 * priority list knows about.
 */
export const getPreferredDefaultTab = (tabs: string[]): string =>
  DEFAULT_DASHBOARD_TAB_PRIORITY.find((tab) => tabs.includes(tab)) || tabs[0]

/**
 * Guess the tab a line of the morning brief is talking about, from its words.
 *
 * Order is load-bearing and not alphabetical: earlier rules win. "Sale" is checked before "cost"
 * so "cost of sales" routes to sales, and the dispatch rule owns "received" outright.
 */
export const inferBriefTabFromText = (input: string, visibility: TabVisibility): string => {
  const text = String(input || "").toLowerCase()
  if (!text) return "home"
  if ((text.includes("dispatch") || text.includes("received")) && visibility.canShowDispatch) return "dispatch"
  if ((text.includes("sale") || text.includes("buyer") || text.includes("revenue")) && visibility.canShowSalesWorkspace) {
    return "sales"
  }
  if (
    (text.includes("receivable") || text.includes("outstanding") || text.includes("invoice")) &&
    visibility.canShowReceivables
  ) {
    return "receivables"
  }
  if ((text.includes("labour") || text.includes("expense") || text.includes("cost")) && visibility.canShowAccounts) {
    return "accounts"
  }
  if ((text.includes("float") || text.includes("yield") || text.includes("process")) && visibility.canShowProcessing) {
    return "processing"
  }
  if (
    (text.includes("stock") || text.includes("inventory") || text.includes("transaction")) &&
    visibility.showTransactionHistory
  ) {
    return "transactions"
  }
  return "home"
}

/**
 * Where an exception alert drills down to, keyed on the metric that raised it.
 *
 * Each group falls back to season, then home, so a tenant without the owning module still lands
 * somewhere that exists.
 */
export const resolveExceptionDrilldownTab = (metric: string | undefined, visibility: TabVisibility): string => {
  const seasonOrHome = visibility.canShowSeason ? "season" : "home"
  const normalized = String(metric || "").trim().toLowerCase()
  if (!normalized) return seasonOrHome
  if (["float_rate", "dry_parch_yield", "float_rate_zscore", "dry_parch_yield_zscore"].includes(normalized)) {
    return visibility.canShowProcessing ? "processing" : seasonOrHome
  }
  if (["transit_loss", "dispatch_unconfirmed", "bag_weight_drift"].includes(normalized)) {
    return visibility.canShowDispatch ? "dispatch" : seasonOrHome
  }
  if (["inventory_mismatch", "sales_spike"].includes(normalized)) {
    return visibility.canShowSalesWorkspace ? "sales" : seasonOrHome
  }
  return seasonOrHome
}
