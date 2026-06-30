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

export type AggregatedLaborBreakdown = {
  hfLaborers: number
  hfCostPer: number
  outsideLaborers: number
  outsideCostPer: number
}

const IN_HOUSE_NAMES = new Set(["Estate Labor", "Estate Labour", "In-house"])

/**
 * Collapse an arbitrary-length labor entry list into the two summary buckets
 * the database stores (in-house / outside).
 *
 * The form allows adding labor groups beyond the two defaults ("+Add group",
 * or a lump-sum "Contract" entry) — anything that isn't the in-house bucket
 * gets folded into "outside" here instead of being matched by exact name and
 * silently dropped if unmatched. Worker counts sum directly; the rate is a
 * dollar-weighted blend across the folded groups, so outsideLaborers ×
 * outsideCostPer still reconstructs the right total even when groups at
 * different rates (or a contract lump sum) get merged into one bucket.
 */
export function aggregateLaborEntries(entries: LaborEntry[]): AggregatedLaborBreakdown {
  const hfEntry = entries.find((e) => IN_HOUSE_NAMES.has(String(e.name || ""))) ?? null
  const hfLaborers = Number(hfEntry?.laborCount) || 0
  const hfCostPer = Number(hfEntry?.costPerLabor) || 0

  let outsideLaborers = 0
  let outsideCost = 0
  for (const entry of entries) {
    if (entry === hfEntry) continue
    const laborCount = Number(entry.laborCount) || 0
    const costPerLabor = Number(entry.costPerLabor) || 0
    const contractTotal = Number(entry.contractTotal) || 0
    outsideLaborers += laborCount
    outsideCost += laborCount * costPerLabor + contractTotal
  }
  if (outsideLaborers <= 0 && outsideCost > 0) {
    // Pure lump-sum/contract cost with no headcount (e.g. a contract gang paid
    // a flat amount) — there's no real "per worker" rate to report, but the
    // dollar amount still needs to live somewhere in the 2-bucket summary or
    // hf + outside silently stops reconstructing total_cost again. Represent
    // it as a single unit so outsideLaborers × outsideCostPer = outsideCost.
    // The full breakdown (labor_entries column) is the source of truth for
    // accurate display; this is just keeping the legacy summary honest.
    return { hfLaborers, hfCostPer, outsideLaborers: 1, outsideCostPer: outsideCost }
  }

  const outsideCostPer = outsideLaborers > 0 ? outsideCost / outsideLaborers : 0

  return { hfLaborers, hfCostPer, outsideLaborers, outsideCostPer }
}
