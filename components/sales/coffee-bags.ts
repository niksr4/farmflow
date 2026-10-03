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
 * ⚠ THE PARCHMENT FALLBACK IS LOAD-BEARING HERE, unlike on the write paths.
 *
 * This tab's totals are objects with four fixed keys (arabica/robusta x parchment/cherry), so a
 * third answer has nowhere to go -- returning null would index those objects with `undefined` and
 * produce NaN on screen rather than an honest "Unspecified". Making it honest means giving the
 * totals an Unspecified bucket and showing it, which is a UI change rather than this refactor.
 *
 * What is fixed now: the spellings come from lib/crop-config, so "Dry P" is understood here instead
 * of reaching parchment by accident, and this file can no longer recognise a different set from the
 * SQL that produced the rows.
 */
export const normalizeBagType = (value: string | null | undefined) =>
  parseCoffeeForm(value) === "Dry Cherry" ? "cherry" : "parchment"

export const formatBagTypeLabel = (value: string | null | undefined) =>
  normalizeBagType(value) === "cherry" ? "Dry Cherry" : "Dry Parchment"

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
