/**
 * Coffee type and bag type normalisation for the Sales tab.
 *
 * Moved out of components/sales-tab.tsx unchanged on 2026-09-21. Every export here is a pure
 * function or a constant derived from one, so this move carries no behaviour risk.
 *
 * NOTE: components/dispatch-tab.tsx has its own near-identical normalizeBagTypeKey /
 * formatBagTypeLabel pair with a DIFFERENT signature (string, not string | null | undefined).
 * Both now take the cherry-or-parchment decision from lib/crop-config, so the SPELLINGS they accept
 * can no longer drift apart; only the key vocabulary and the signature still differ.
 */

import {
  ARABICA,
  COFFEE_FORMS,
  DEFAULT_COFFEE_VARIETIES,
  ROBUSTA,
  displayCoffeeForm,
  parseCoffeeForm,
  parseCoffeeVariety,
} from "@/lib/crop-config"
import { resolveDispatchReceivedKgs as resolveDispatchReceivedKgsValue, resolveSalesKgs } from "@/lib/sales-math"
import type { DispatchSummaryRow, SalesRecord } from "./types"

export const COFFEE_TYPES = DEFAULT_COFFEE_VARIETIES
export const BAG_TYPES = COFFEE_FORMS
export const LOCATION_ALL = "all"
export const STOCK_EPSILON = 0.0001

/**
 * The breakdown key for a row's form, including a third bucket for one nobody can read.
 *
 * This used to fall back to "parchment" for anything it did not recognise, because the totals had
 * only two form keys and a third answer would have indexed them with `undefined` and rendered NaN.
 * InventoryBreakdown now carries `unspecified`, so the honest answer has somewhere to go: kilos whose
 * form is unknown are shown as unknown instead of inflating parchment.
 */
export const normalizeBagType = (value: string | null | undefined): "cherry" | "parchment" | "unspecified" => {
  const form = parseCoffeeForm(value)
  if (form === "Dry Cherry") return "cherry"
  if (form === "Dry Parchment") return "parchment"
  return "unspecified"
}

/** The label a reader sees. Falls through to UNSPECIFIED_LABEL rather than naming a form it cannot read. */
export const formatBagTypeLabel = (value: string | null | undefined) => displayCoffeeForm(value)

export const normalizeCoffeeType = (value: string | null | undefined) => {
  const variety = parseCoffeeVariety(value)
  if (variety === "Arabica") return "arabica"
  if (variety === "Robusta") return "robusta"
  return "other"
}

export const ARABICA_LABEL = ARABICA
export const ROBUSTA_LABEL = ROBUSTA

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
