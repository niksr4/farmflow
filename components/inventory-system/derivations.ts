/**
 * Pure derivations lifted out of InventorySystem().
 *
 * WHY THESE AND NOT THE JSX. The shell is 5,074 lines and the obvious cut is its 1,131-line render
 * block — but nothing in this repository can verify that cut. vitest runs in `environment: "node"`
 * with no jsdom and no testing-library, so no component is ever mounted; 71 test files assert by
 * reading source text and grepping for strings. A JSX refactor would break those spuriously (they
 * match literals that move) while catching none of the real breakage, and the tabs with no e2e
 * coverage at all are muster, payroll, picking and rainfall.
 *
 * Which matters because of what the three September bug passes actually found: a missing
 * `<TableCell>` that printed Net Payable under the "Overtime" heading, a column count, a tooltip
 * describing money that had moved. Every one a rendering bug — exactly the class a refactor
 * introduces and exactly the class this suite cannot see.
 *
 * Logic is the other 80%, and it CAN be tested here. So the shell shrinks by moving out the parts
 * that come with proof, and the render block waits for a net that can hold it.
 *
 * Everything below is a pure function of its arguments: no hooks, no state, no fetch, no clock
 * except where a clock is passed in.
 */

/** A fiscal year as the shell holds it — only the two ends matter here. */
export type FiscalYearRange = {
  startDate: string | Date
  endDate: string | Date
}

export type SeasonProgress = {
  /** 0–100, clamped. */
  pct: number
  daysRemaining: number
}

/**
 * How far through the season we are, and how much of it is left.
 *
 * `now` is a parameter rather than a call to Date.now() so this is testable at all — the version
 * inside the shell read the clock directly, which is why it never had a test.
 *
 * ⚠ A ZERO-LENGTH YEAR RETURNS 0%, NOT NaN. The original divided by (end - start) with no guard,
 * so a fiscal year whose two ends are the same date produced NaN, and `Math.round(NaN)` survives
 * every clamp around it — `Math.min(100, Math.max(0, NaN))` is NaN. It would have rendered as
 * "NaN%" on the hero strip. No tenant has such a year today; the guard costs one comparison.
 */
export function seasonProgress(fiscalYear: FiscalYearRange, now: number = Date.now()): SeasonProgress {
  const start = new Date(fiscalYear.startDate).getTime()
  const end = new Date(fiscalYear.endDate).getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { pct: 0, daysRemaining: 0 }
  }

  const pct = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
  const daysRemaining = Math.max(0, Math.ceil((end - now) / 86_400_000))
  return { pct, daysRemaining }
}

/**
 * Hide metric tiles whose value is exactly zero — unless that would empty the row.
 *
 * The fallback is the whole point and is easy to drop in a rewrite: a workspace where every metric
 * happens to be zero is a workspace that would render no tiles at all, which reads as broken rather
 * than as quiet. Better to show zeroes than nothing.
 *
 * A null or undefined value is NOT zero and is always kept — it means "not loaded yet", and hiding
 * it would make a tile flicker out and back as data arrives.
 */
export function filterEmptyMetrics<T extends { metricValue?: number | null }>(
  items: readonly T[],
  hideEmptyMetrics: boolean,
): readonly T[] {
  if (!hideEmptyMetrics) return items
  const filtered = items.filter(
    (item) => item.metricValue === undefined || item.metricValue === null || item.metricValue !== 0,
  )
  return filtered.length ? filtered : items
}

/**
 * Which export datasets this tenant can actually run, from its module flags.
 *
 * A Set rather than a count, because the count was all the shell kept and the count is the less
 * useful half — "which ones" answers the support question, "how many" only fills a badge.
 *
 * Three datasets are unions rather than one-module-one-dataset, and that is the part worth pinning:
 * reconciliation needs any of dispatch, sales or season; pnl-monthly needs any of accounts, sales
 * or season; accounts alone yields two datasets, labour and expenses.
 */
export type ExportModuleFlags = {
  canShowProcessing?: boolean
  canShowDispatch?: boolean
  canShowSales?: boolean
  canShowPepper?: boolean
  canShowRainfall?: boolean
  showTransactionHistory?: boolean
  canShowInventory?: boolean
  canShowAccounts?: boolean
  canShowSeason?: boolean
  canShowReceivables?: boolean
}

export function availableExportDatasets(flags: ExportModuleFlags): Set<string> {
  const datasets = new Set<string>()
  if (flags.canShowProcessing) datasets.add("processing")
  if (flags.canShowDispatch) datasets.add("dispatch")
  if (flags.canShowSales) datasets.add("sales")
  if (flags.canShowPepper) datasets.add("pepper")
  if (flags.canShowRainfall) datasets.add("rainfall")
  if (flags.showTransactionHistory) datasets.add("transactions")
  if (flags.canShowInventory) datasets.add("inventory")
  if (flags.canShowAccounts) {
    datasets.add("labour")
    datasets.add("expenses")
  }
  if (flags.canShowDispatch || flags.canShowSales || flags.canShowSeason) datasets.add("reconciliation")
  if (flags.canShowReceivables) datasets.add("receivables-aging")
  if (flags.canShowAccounts || flags.canShowSales || flags.canShowSeason) datasets.add("pnl-monthly")
  return datasets
}

/**
 * The blocks visible under the current estate selection.
 *
 * Returns ALL blocks when no estate is chosen or the tenant has only one — not an empty list. A
 * single-estate tenant has no estate selector, so filtering on a null selection would empty the
 * block picker for four of the five live tenants.
 */
export function estateFilteredLocations<T extends { estate?: string | null }>(
  blockLocations: readonly T[],
  options: { canSelectEstate: boolean; selectedEstate: string | null },
): readonly T[] {
  if (!options.canSelectEstate || !options.selectedEstate) return blockLocations
  return blockLocations.filter((loc) => loc.estate === options.selectedEstate)
}
