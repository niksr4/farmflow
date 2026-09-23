/**
 * Coffee type and bag type normalisation for the Sales tab.
 *
 * Moved out of components/sales-tab.tsx unchanged on 2026-09-21. Every export here is a pure
 * function or a constant derived from one, so this move carries no behaviour risk.
 *
 * NOTE: components/dispatch-tab.tsx has its own near-identical normalizeBagTypeKey /
 * formatBagTypeLabel pair with a DIFFERENT signature (string, not string | null | undefined).
 * They are deliberately not merged -- see the note in that file before unifying them.
 */

import { DEFAULT_COFFEE_VARIETIES } from "@/lib/crop-config"
import { resolveDispatchReceivedKgs as resolveDispatchReceivedKgsValue, resolveSalesKgs } from "@/lib/sales-math"
import type { DispatchSummaryRow, SalesRecord } from "./types"

export const COFFEE_TYPES = DEFAULT_COFFEE_VARIETIES
export const BAG_TYPES = ["Dry Parchment", "Dry Cherry"]
export const LOCATION_ALL = "all"
export const STOCK_EPSILON = 0.0001

export const normalizeBagType = (value: string | null | undefined) =>
  String(value || "").toLowerCase().includes("cherry") ? "cherry" : "parchment"

export const formatBagTypeLabel = (value: string | null | undefined) =>
  normalizeBagType(value) === "cherry" ? "Dry Cherry" : "Dry Parchment"

export const normalizeCoffeeType = (value: string | null | undefined) => {
  const normalized = String(value || "").toLowerCase()
  if (normalized.includes("arabica")) return "arabica"
  if (normalized.includes("robusta")) return "robusta"
  return "other"
}

export const ARABICA_LABEL =
  COFFEE_TYPES.find((type) => String(type || "").toLowerCase().includes("arabica")) || "Arabica"
export const ROBUSTA_LABEL =
  COFFEE_TYPES.find((type) => String(type || "").toLowerCase().includes("robusta")) || "Robusta"

export const toCanonicalCoffeeLabel = (value: string | null | undefined) => {
  const normalized = normalizeCoffeeType(value)
  if (normalized === "arabica") return ARABICA_LABEL
  if (normalized === "robusta") return ROBUSTA_LABEL
  const raw = String(value || "").trim()
  return raw || "Unknown"
}

export const resolveDispatchReceivedKgs = (
  row: Pick<DispatchSummaryRow, "kgs_received" | "bags_dispatched">,
  bagWeightKg: number,
) => resolveDispatchReceivedKgsValue(row, bagWeightKg)

export const resolveSalesRecordKgs = (
  record: Pick<SalesRecord, "kgs" | "kgs_received" | "weight_kgs" | "kgs_sent" | "bags_sold">,
  bagWeightKg: number,
) => resolveSalesKgs(record, bagWeightKg)
