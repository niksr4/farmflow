/**
 * The single definition of what an inventory ledger adds up to.
 *
 * There used to be two. `recalculateInventoryForItem` replayed transactions in date order,
 * clamping at zero on every depletion, and that is what actually maintains `current_inventory`.
 * The Accounts reconciliation check meanwhile used a plain
 * `SUM(CASE WHEN restock THEN qty ELSE -qty END)`, which lets the running balance go negative.
 *
 * For one real tenant those disagreed by a factor of four — the check reported a 37,697-unit
 * drift where the app's own model gives 9,853 — because a depletion larger than the stock on
 * hand counts in full in the sum but only down to zero in the replay. The check was measuring
 * something the system never computes, so anything "corrected" to satisfy it would have driven
 * the real inventory badly wrong.
 *
 * Both callers now use this.
 */

export type LedgerTransaction = {
  transaction_type?: string | null
  quantity?: number | string | null
  total_cost?: number | string | null
}

export type LedgerBalance = {
  quantity: number
  totalCost: number
  avgPrice: number
}

export const isRestockTransaction = (value: unknown) => {
  const normalized = String(value ?? "").toLowerCase()
  return normalized === "restock" || normalized === "restocking"
}

/** Clamp IEEE-754 residuals that should be exactly zero. */
const clampFloat = (n: number) => (Math.abs(n) < 1e-6 ? 0 : Math.round(n * 10000) / 10000)

/**
 * Replay one slot's transactions, **in date order**, to the balance they produce.
 *
 * Depletions are valued at the running weighted average, and neither quantity nor cost is
 * allowed below zero — you cannot consume stock that was never received, so a ledger that
 * would go negative is missing history rather than describing a negative balance.
 *
 * Order matters: pass transactions sorted by (transaction_date, id), the same order
 * recalculateInventoryForItem uses. Out-of-order input changes the average-cost maths.
 */
export function replayInventoryLedger(transactions: readonly LedgerTransaction[]): LedgerBalance {
  let quantity = 0
  let totalCost = 0

  for (const row of transactions) {
    const qty = Number(row?.quantity) || 0
    const cost = Number(row?.total_cost) || 0

    if (isRestockTransaction(row?.transaction_type)) {
      quantity += qty
      totalCost += cost
      continue
    }

    const avgCost = quantity > 0 ? totalCost / quantity : 0
    quantity = Math.max(0, quantity - qty)
    totalCost = Math.max(0, totalCost - avgCost * qty)
  }

  quantity = clampFloat(quantity)
  totalCost = clampFloat(totalCost)

  return {
    quantity,
    totalCost,
    avgPrice: quantity > 0 ? clampFloat(totalCost / quantity) : 0,
  }
}

export type SlotDriftCause = "consistent" | "backdated-entry" | "unexplained"

/**
 * Explain why a slot's stored balance and its replayed balance disagree.
 *
 * The database trigger applies each transaction against the balance **as it stands at insert
 * time**; the replay applies them in **transaction-date order**. Those only diverge when
 * something is entered dated earlier than the stock that covers it — logging Monday's spray on
 * Tuesday, which estates do constantly. It is not a data error and the stored balance is the
 * trustworthy one there, because it is what the trigger allowed against real stock.
 *
 * Replaying the same rows both ways separates the two cases:
 *   - insertion-order replay matches the stored balance → back-dating, stored value is right
 *   - neither ordering matches                          → genuinely missing or altered history
 */
export function classifySlotDrift(params: {
  /** Slot transactions in (transaction_date, id) order. */
  byDate: readonly LedgerTransaction[]
  /** The same transactions in insertion (id) order. */
  byInsertion: readonly LedgerTransaction[]
  storedQuantity: number
  tolerance?: number
}): { cause: SlotDriftCause; byDateQuantity: number; byInsertionQuantity: number } {
  const tolerance = params.tolerance ?? 0.5
  const byDateQuantity = replayInventoryLedger(params.byDate).quantity
  const byInsertionQuantity = replayInventoryLedger(params.byInsertion).quantity
  const stored = Number(params.storedQuantity) || 0

  if (Math.abs(stored - byDateQuantity) < tolerance) {
    return { cause: "consistent", byDateQuantity, byInsertionQuantity }
  }
  if (Math.abs(stored - byInsertionQuantity) < tolerance) {
    return { cause: "backdated-entry", byDateQuantity, byInsertionQuantity }
  }
  return { cause: "unexplained", byDateQuantity, byInsertionQuantity }
}

/**
 * Replay a whole tenant's ledger, grouped into (item, location) slots, and total the result.
 *
 * Grouping is not optional. Replaying every transaction as one stream would let one item's
 * restock cover another item's depletion and silently hide a real shortfall.
 */
export function replayLedgerBySlot(
  transactions: readonly (LedgerTransaction & { item_type?: string | null; location_id?: string | null })[],
): { quantity: number; totalCost: number; slots: number } {
  const slots = new Map<string, LedgerTransaction[]>()

  for (const row of transactions) {
    const key = `${row?.item_type ?? ""}::${row?.location_id ?? "null"}`
    const bucket = slots.get(key)
    if (bucket) bucket.push(row)
    else slots.set(key, [row])
  }

  let quantity = 0
  let totalCost = 0
  for (const bucket of slots.values()) {
    const balance = replayInventoryLedger(bucket)
    quantity += balance.quantity
    totalCost += balance.totalCost
  }

  return { quantity: clampFloat(quantity), totalCost: clampFloat(totalCost), slots: slots.size }
}
