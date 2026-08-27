/**
 * Catching a restock cost that cannot be right, at the moment it is typed.
 *
 * WHAT THE FIELD MEANS CHANGED, WHICH IS THE WHOLE REASON THIS IS NEEDED. Until 2026-08-24 the
 * restock form asked for a per-unit rate; since 35d4a2d it asks for the invoice TOTAL and derives
 * the unit price by dividing (lib/stock-cost.ts). Both mistakes are therefore live, in opposite
 * directions, and an estate that learned the old form is the most likely to make the new one:
 *
 *   - the OLD error, still sitting in the data: the total typed into a per-unit box. Seshagiri
 *     booked Rs 1.03 crore of fertiliser against about Rs 2.6 lakh of purchases that way. Their DAP
 *     went in twice, as 50 bags "at 70,000" and 40 bags "at 56,000" -- Rs 1,400 a bag both times,
 *     against Rs 1,350 in their own store.
 *   - the NEW error, which nothing guards yet: a per-unit rate typed into the total box. Enter
 *     1,350 for 50 bags and the stock is valued at twenty-seven rupees a bag. That understates the
 *     books rather than inflating them, so nobody notices until a depletion books almost nothing.
 *
 * Both show up the same way once you look at the right number: the DERIVED unit price, total over
 * quantity, compared with what the item has always cost. This checks that, in both directions.
 *
 * IT WARNS, IT DOES NOT BLOCK. Prices move, bulk buys differ, and an estate that gets told "no" by
 * a form it knows better than will work around the form. It says nothing at all when there is no
 * history to compare against -- a first purchase has no baseline, and a warning on every new item
 * is a warning nobody reads.
 */

/** Beyond this multiple of the item's usual unit price -- or below its reciprocal -- say something. */
export const PRICE_OUTLIER_RATIO = 3

/**
 * How close a hypothesis has to land before we name it as the likely cause. Wide, because prices
 * genuinely drift between purchases: Seshagiri's MOP was 3% out, Urea 9%.
 */
export const HYPOTHESIS_TOLERANCE = 0.35

export type PriceCheck =
  | { level: "ok" }
  | {
      level: "warn"
      /** The unit price this entry implies: total / quantity. */
      derivedUnitPrice: number
      /** How far off the usual price it is, as a multiple (always >= 1). */
      ratio: number
      /** "high" = each unit looks far too dear, "low" = far too cheap. */
      direction: "high" | "low"
      message: string
    }

const money = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n < 100 ? 2 : 0 })}`

/**
 * @param totalPaid   the invoice total, as the form now asks for it
 * @param quantity    units being taken in
 * @param usualPrice  what one unit has cost before (the item's running average); null/0 when new
 * @param unit        for the message only
 */
export function checkRestockCost(
  totalPaid: number,
  quantity: number,
  usualPrice: number | null | undefined,
  unit = "unit",
): PriceCheck {
  const total = Number(totalPaid)
  const qty = Number(quantity)
  const usual = Number(usualPrice)

  // No baseline, no opinion. A first purchase is not evidence of anything.
  if (!Number.isFinite(total) || total <= 0) return { level: "ok" }
  if (!Number.isFinite(qty) || qty <= 0) return { level: "ok" }
  if (!Number.isFinite(usual) || usual <= 0) return { level: "ok" }

  const derivedUnitPrice = total / qty

  if (derivedUnitPrice >= usual * PRICE_OUTLIER_RATIO) {
    const ratio = derivedUnitPrice / usual
    // The classic old-form mistake: the figure entered is itself the per-unit rate, so the "total"
    // is really rate x quantity. Test it by asking what the total would be if it were per-unit.
    const looksLikeUnitRateInTotalBox = Math.abs(total - usual) / usual <= HYPOTHESIS_TOLERANCE
    return {
      level: "warn",
      derivedUnitPrice,
      ratio,
      direction: "high",
      message: looksLikeUnitRateInTotalBox
        ? `That works out to ${money(derivedUnitPrice)} per ${unit}, about ${ratio.toFixed(0)}× the ${money(usual)} you usually pay. ` +
          `If ${money(total)} is the price of one ${unit}, the total for ${qty} is ${money(usual * qty)}.`
        : `That works out to ${money(derivedUnitPrice)} per ${unit}, about ${ratio.toFixed(0)}× the ${money(usual)} you usually pay. Check the amount.`,
    }
  }

  if (derivedUnitPrice * PRICE_OUTLIER_RATIO <= usual) {
    const ratio = usual / derivedUnitPrice
    return {
      level: "warn",
      derivedUnitPrice,
      ratio,
      direction: "low",
      // Since 24 Aug this box wants the whole invoice. Someone entering the per-unit rate they are
      // used to lands here, and the understatement is silent.
      message:
        `That works out to ${money(derivedUnitPrice)} per ${unit}, about ${ratio.toFixed(0)}× cheaper than the ${money(usual)} you usually pay. ` +
        `This box wants the total for all ${qty} ${unit} — if ${money(total)} is the price of one, the total is ${money(total * qty)}.`,
    }
  }

  return { level: "ok" }
}
