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
import type { DispatchSummaryRow, InventoryBreakdown, SalesRecord } from "./types"

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

/**
 * The derived stock headlines, split so the two that are NOT the same thing cannot be conflated.
 *
 * ⚠ EXTRACTED BECAUSE ALL THREE OF THESE WERE WRONG AND NOTHING NOTICED. They lived inline in
 * sales-tab.tsx, and when the `unspecified` bucket was added they were not updated with it: the
 * overdrawn figure skipped an overdrawn unspecified position entirely (the per-type clamp floors
 * availability at zero, so the overdraw disappeared from the screen rather than being reported), and
 * the "Available To Sell" headline counted unspecified kilos the sale form cannot dispose of.
 *
 *   available     INVENTORY. Every kilo on hand, unreadable label included -- the coffee exists.
 *   sellable      What the sale form can actually dispose of. It offers parchment or cherry and
 *                 checks stock for the form chosen, so unspecified kilos can never be sold through
 *                 it. Advertising them tells the writer to sell something they then cannot.
 *   unclassified  The difference, surfaced so the gap has a name and a fix.
 *   overdrawn     Sold beyond receipts, counting ALL THREE forms. Selling 50 kg under an unreadable
 *                 form with no matching receipt is exactly as overdrawn as doing it under parchment.
 *
 * For canonical data -- every real tenant, every row -- `sellable` equals `available`, `unclassified`
 * is zero, and `overdrawn` is unchanged. That equivalence is the property under test.
 */
export const summariseAvailability = (
  coffeeTypes: readonly string[],
  received: Record<string, InventoryBreakdown>,
  sold: Record<string, InventoryBreakdown>,
  available: Record<string, InventoryBreakdown>,
) => {
  const sum = (pick: (b: InventoryBreakdown | undefined) => number) =>
    coffeeTypes.reduce((acc, type) => acc + pick(available[type]), 0)

  const overdrawn = (field: "kgs" | "bags") =>
    coffeeTypes.reduce((acc, type) => {
      const net = (form: "cherry" | "parchment" | "unspecified") =>
        (received[type]?.[form][field] || 0) - (sold[type]?.[form][field] || 0)
      return (
        acc + Math.max(0, -net("cherry")) + Math.max(0, -net("parchment")) + Math.max(0, -net("unspecified"))
      )
    }, 0)

  return {
    totalAvailable: sum((b) => b?.total.kgs || 0),
    totalAvailableBags: sum((b) => b?.total.bags || 0),
    totalSellable: sum((b) => (b?.cherry.kgs || 0) + (b?.parchment.kgs || 0)),
    totalSellableBags: sum((b) => (b?.cherry.bags || 0) + (b?.parchment.bags || 0)),
    totalUnclassified: sum((b) => b?.unspecified.kgs || 0),
    totalOverdrawn: overdrawn("kgs"),
    totalOverdrawnBags: overdrawn("bags"),
  }
}
