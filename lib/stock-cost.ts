/**
 * What a restock cost, resolved from whichever of the two numbers the caller sent.
 *
 * WHY TOTAL IS NOW THE QUESTION WE ASK. `replayInventoryLedger` rebuilds the weighted average from
 * `quantity` and `total_cost` and never reads the `price` column at all. So total_cost is the
 * number every costed depletion ultimately rests on -- and the forms used to ask for the unit
 * price and *derive* total_cost from it, which is backwards: we collected the rounded figure and
 * computed the authoritative one out of it.
 *
 * Three things follow from asking for the total instead:
 *
 *   - Rs 1,000 for 3 kg is Rs 333.333.../kg. Someone typing 333 makes total_cost Rs 999, and every
 *     depletion of that item is costed fractionally low from then on, with nothing to compare it
 *     against. Capturing 1,000 makes the arithmetic exact and pushes the recurring decimal into
 *     the derived field, where nobody has to type it.
 *   - An invoice total is the landed cost: it includes delivery and loading. Ask for a unit price
 *     and people quietly leave those out, so stock looks cheaper in the shed than it was at the
 *     bank.
 *   - It is what the invoice actually says, so nobody does arithmetic in their head to answer.
 *
 * Both columns are still written. `price` stays populated because the ledger, exports and the edit
 * dialog all display it, and because a per-unit figure is the sanity check that catches a
 * fat-fingered quantity -- a wildly wrong per-kg number is obvious in a way a total is not.
 */
export type StockCostInput = {
  quantity: unknown
  /** What the invoice says was paid, in total. Preferred. */
  totalPrice?: unknown
  /** Legacy per-unit entry. Used only when no total is supplied. */
  unitPrice?: unknown
}

export type StockCost = {
  /** Authoritative. This is what the weighted-average replay reads. */
  totalCost: number
  /** Derived when a total was given; echoed when it was not. Display and export only. */
  unitPrice: number
}

const num = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Accepts either shape on purpose. The clients are being moved to `totalPrice` one form at a time,
 * and a route that only understood the new field would reject the old one mid-rollout -- while a
 * route that silently ignored an unknown field would store a zero-cost restock, which is the exact
 * corruption the price rules exist to prevent. Supporting both is the only option that fails safe.
 */
export function resolveStockCost({ quantity, totalPrice, unitPrice }: StockCostInput): StockCost {
  const qty = num(quantity)
  const total = num(totalPrice)
  const unit = num(unitPrice)

  if (total > 0) {
    // Deriving downwards. A zero or negative quantity would divide by zero, so the unit price is
    // reported as 0 rather than Infinity -- the total is still recorded truthfully either way.
    return { totalCost: round2(total), unitPrice: qty > 0 ? total / qty : 0 }
  }

  return { totalCost: round2(qty * unit), unitPrice: unit }
}

/**
 * Money, to the paisa. The unit price is deliberately NOT rounded -- it is derived, and rounding it
 * here would reintroduce the drift that asking for the total was meant to remove. Postgres numeric
 * holds the full quotient.
 */
const round2 = (value: number) => Number(value.toFixed(2))

/**
 * Whether this restock has a cost at all. A restock at zero corrupts the weighted average for every
 * later depletion of the item, so all four write paths refuse one -- opening stock, a new restock,
 * an edit, and the bulk import.
 */
export const hasStockCost = (cost: StockCost) => cost.totalCost > 0
