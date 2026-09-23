/**
 * Bag type normalisation and kg resolution for the Dispatch tab.
 *
 * Moved out of components/dispatch-tab.tsx unchanged on 2026-09-21. Every export here is a pure
 * function or a constant, so this move carries no behaviour risk.
 *
 * ⚠ resolveDispatchRecordReceivedKgs is a LOCAL REIMPLEMENTATION of resolveDispatchReceivedKgs in
 * lib/sales-math.ts. The two agree today -- both return the measured kgs_received when it is
 * positive and 0 otherwise, and both ignore bagWeightKg deliberately, because a dispatch that has
 * not been weighed at the curer has no received weight and inventing a nominal one would book
 * stock that nobody has confirmed arriving. They are NOT linked, so a fix to the shared helper
 * does not reach this one. Collapse them onto lib/sales-math when touching either.
 *
 * Note components/sales/coffee-bags.ts has its own normalizeBagType / formatBagTypeLabel pair
 * with a WIDER signature (string | null | undefined). Merging the two is a real behaviour change
 * on null input, not a tidy-up.
 */

import { DEFAULT_COFFEE_VARIETIES } from "@/lib/crop-config"
import type { BagTotals, DispatchRecord } from "./types"

export const COFFEE_TYPES = DEFAULT_COFFEE_VARIETIES
export const BAG_TYPES = ["Dry Parchment", "Dry Cherry"]
export const STOCK_EPSILON = 0.0001

export const emptyBagTotals: BagTotals = {
  arabica_dry_parchment_bags: 0,
  arabica_dry_cherry_bags: 0,
  robusta_dry_parchment_bags: 0,
  robusta_dry_cherry_bags: 0,
}

export const normalizeBagTypeKey = (value: string) => {
  const normalized = value.toLowerCase().trim()
  if (normalized.includes("cherry")) return "dry_cherry"
  return "dry_parchment"
}

export const formatBagTypeLabel = (value: string) =>
  normalizeBagTypeKey(value) === "dry_cherry" ? "Dry Cherry" : "Dry Parchment"

export const resolveDispatchRecordNominalKgs = (
  record: Pick<DispatchRecord, "bags_dispatched">,
  bagWeightKg: number,
) => (Number(record.bags_dispatched) || 0) * bagWeightKg

export const resolveDispatchRecordReceivedKgs = (
  record: Pick<DispatchRecord, "kgs_received" | "bags_dispatched">,
  _bagWeightKg: number,
) => {
  const kgsReceivedValue = Number(record.kgs_received) || 0
  if (kgsReceivedValue > 0) return kgsReceivedValue
  return 0
}
