import { normalizeInventoryItemType } from "@/lib/inventory-item-type"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"

/**
 * What a held item is worth, and how honest that figure is.
 *
 * Lifted out of components/inventory-system.tsx (5,465 lines against a 1,000-line target) because
 * it is pure arithmetic that decides a money figure on screen, and it had no test of any kind.
 * The DAP question on 2026-09-08 -- "the rate should be Rs 27, it shows Rs 18" -- turned on exactly
 * this chain, and answering it meant reading the component to work out which of three sources the
 * number came from.
 *
 * THE FALLBACK ORDER IS THE WHOLE THING. It is deliberately most-trusted-first:
 *
 *   1. `avg_price` from current_inventory  -- maintained by the transaction path, the real answer
 *   2. `total_cost / quantity`             -- same figure recomputed, for rows where avg drifted
 *   3. the transaction-derived average     -- last resort, priced movements only
 *
 * Each step is guarded on `> 0` rather than on presence, because zero is the value a missing price
 * actually takes here, and treating it as "known to be free" is how an unpriced item silently
 * values a shed at nothing. Production has a lot of those: 21 HoneyFarm items and 5 Laxmi ones were
 * restocked with no price at all, which is why `summariseInventoryValue` reports a caveat rather
 * than a total on its own.
 */

export type ItemValue = { avgPrice: number; totalValue: number }

export type TransactionPricing = Record<string, { avgPrice: number; totalCost: number }>

const positive = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * A weighted average per item, from the movements that carry a price.
 *
 * Movements priced at zero are SKIPPED, not averaged in as free stock. A restock recorded without a
 * price is a missing fact, and letting it pull the average toward zero is what turned HoneyFarm's
 * DAP into Rs 15.81 a kilo when every actual purchase was Rs 27.
 */
export function buildTransactionPricing(transactions: readonly Transaction[]): TransactionPricing {
  const agg: Record<string, { totalCost: number; totalQty: number }> = {}

  for (const tx of transactions) {
    const itemName = normalizeInventoryItemType(tx.item_type)
    if (!itemName) continue

    const qty = positive(tx.quantity)
    if (!qty) continue

    // A unit price if there is one, otherwise back it out of the line total. Never both.
    const unitPrice = positive(tx.price) || positive(Number(tx.total_cost) / qty)
    if (!unitPrice) continue

    const existing = agg[itemName] || { totalCost: 0, totalQty: 0 }
    existing.totalCost += unitPrice * qty
    existing.totalQty += qty
    agg[itemName] = existing
  }

  const pricing: TransactionPricing = {}
  for (const [itemName, data] of Object.entries(agg)) {
    pricing[itemName] = {
      avgPrice: data.totalQty > 0 ? data.totalCost / data.totalQty : 0,
      totalCost: data.totalCost,
    }
  }
  return pricing
}

/** One item's unit cost and holding value, following the fallback order above. */
export function resolveItemValue(item: InventoryItem, pricing: TransactionPricing): ItemValue {
  const avgFromInventory = positive(item.avg_price)
  const totalFromInventory = positive(item.total_cost)
  const quantityValue = positive(item.quantity)

  const avgFromTotal = totalFromInventory && quantityValue ? totalFromInventory / quantityValue : 0
  const fallbackAvg = pricing[item.name]?.avgPrice || 0

  const avgPrice = avgFromInventory || avgFromTotal || fallbackAvg
  // A stored total wins over a recomputed one: it is what the ledger actually says was paid.
  const totalValue = totalFromInventory || avgPrice * quantityValue

  return { avgPrice, totalValue }
}

/**
 * The total, plus the sentence that stops it being read as a valuation.
 *
 * Derived from the same list it sums rather than from the API summary -- a caveat that disagrees
 * with the number printed beside it is worse than no caveat.
 */
export function summariseInventoryValue(
  items: readonly InventoryItem[],
  pricing: TransactionPricing,
): { totalValue: number; unpricedCount: number; heldCount: number; caveat: string | null } {
  let totalValue = 0
  let unpricedCount = 0
  let heldCount = 0

  for (const item of items) {
    const value = resolveItemValue(item, pricing)
    totalValue += value.totalValue

    // Only stock actually on hand can be "unpriced" in a way anybody can fix.
    if (positive(item.quantity)) {
      heldCount += 1
      if (!positive(value.totalValue)) unpricedCount += 1
    }
  }

  const caveat =
    unpricedCount > 0 && heldCount > 0
      ? `${unpricedCount} of ${heldCount} items in stock have no cost recorded — this is at least what your stock is worth, not the full value.`
      : null

  return { totalValue, unpricedCount, heldCount, caveat }
}
