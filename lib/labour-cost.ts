/**
 * Shared labour cost calculation used by both the API routes (POST and PUT)
 * and by tests. Keeping this in one place means a single fix propagates
 * everywhere and the test exercises exactly what production runs.
 */

export type LaborEntry = {
  name?: string
  /** Workers count — 0 for contract/lump-sum entries */
  laborCount?: number | null
  /** Rate per worker — 0 for contract/lump-sum entries */
  costPerLabor?: number | null
  /** Lump-sum total for contract entries (laborCount/costPerLabor not used) */
  contractTotal?: number | null
}

/**
 * Compute the total labour cost from an array of labour entries.
 *
 * Supports two entry types:
 *  - Regular: total = laborCount × costPerLabor
 *  - Contract: total = contractTotal (laborCount and costPerLabor are 0)
 */
export function computeLaborTotalCost(entries: LaborEntry[]): number {
  return entries.reduce(
    (sum, e) =>
      sum +
      (Number(e.laborCount) || 0) * (Number(e.costPerLabor) || 0) +
      (Number(e.contractTotal) || 0),
    0,
  )
}
