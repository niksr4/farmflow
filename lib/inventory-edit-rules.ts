/**
 * Rules for editing an existing inventory transaction, shared by the edit dialog and
 * PUT /api/transactions-neon/update so the client and server can't drift apart.
 */

export const isRestockType = (value: unknown) => String(value ?? "").toLowerCase().includes("restock")

export type TransactionEditState = {
  /** Type the row will have after the edit. */
  nextType: unknown
  /** Unit price the row will have after the edit. */
  nextPrice: unknown
  /** Type currently stored in the database. */
  storedType: unknown
  /** Unit price currently stored in the database. */
  storedPrice: unknown
}

/**
 * Whether the edit must be rejected for lacking a unit price.
 *
 * A ₹0 restock corrupts the weighted average cost for every later depletion, so restocks
 * need a price. Rows *already* stored as a ₹0 restock are exempt: they predate the rule,
 * and blocking them left owners unable to fix even a wrong quantity. The only save the
 * form would then accept was flipping the row to "deplete" — which silently wiped real
 * stock — so the exemption is what keeps the correct path open.
 *
 * The exemption deliberately requires the stored row to be a restock. A stored depletion
 * has no meaningful price (depletions are valued at the running average), so turning one
 * into a restock at ₹0 would introduce a fresh zero-priced restock.
 */
export function requiresRestockUnitPrice(state: TransactionEditState): boolean {
  if (!isRestockType(state.nextType)) return false
  if (Number(state.nextPrice) > 0) return false
  const storedIsZeroPricedRestock = isRestockType(state.storedType) && !(Number(state.storedPrice) > 0)
  return !storedIsZeroPricedRestock
}

/**
 * Stock balance for a slot once a pending edit is applied.
 *
 * A restock contributes `+quantity` to the balance and a depletion `-quantity`, so the
 * projection swaps the stored row's contribution for the edited one. Flipping a restock
 * into a depletion therefore moves the balance by twice the quantity, which is why it can
 * empty a slot that looked healthy.
 */
export function projectSlotBalance(params: {
  currentBalance: unknown
  storedType: unknown
  storedQuantity: unknown
  nextType: unknown
  nextQuantity: unknown
}): number {
  const signed = (type: unknown, quantity: unknown) =>
    (isRestockType(type) ? 1 : -1) * (Number(quantity) || 0)

  return (
    (Number(params.currentBalance) || 0) -
    signed(params.storedType, params.storedQuantity) +
    signed(params.nextType, params.nextQuantity)
  )
}
