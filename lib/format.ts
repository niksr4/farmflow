export const formatNumber = (value: number, digits = 2) => {
  const rawValue = Number.isFinite(value) ? value : 0
  // A figure that rounds away to nothing has no sign worth showing. Without this a net position of
  // -0.30 renders "-0", and now that money rounds to the rupee that is *any* balance between minus
  // fifty paise and zero rather than only the sub-paise case that made this obscure before.
  const safeValue = Number(rawValue.toFixed(digits)) === 0 ? 0 : rawValue
  const formatted = safeValue.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  if (digits > 0) {
    const zeroSuffix = `.${"0".repeat(digits)}`
    if (formatted.endsWith(zeroSuffix)) {
      return formatted.slice(0, -zeroSuffix.length)
    }
  }
  return formatted
}

/**
 * Money, rounded to the rupee.
 *
 * Nobody on an estate settles in paise. A wage bill reading ₹16,96,148.50 asks the reader to
 * discard the last three characters every time, and a column of them costs more attention than the
 * half-rupee is worth. 44 call sites had already worked this out and were passing `0` by hand,
 * which is the tell that the default was wrong rather than that those sites were special.
 *
 * PER-UNIT PRICES ARE THE EXCEPTION -- use `formatUnitPrice`. See its note for why.
 *
 * The `digits` argument stays, for the one place that genuinely needs neither: a tax invoice, where
 * rounding each component independently makes the parts stop summing to the whole.
 */
export const formatCurrency = (value: number, digits = 0) => `₹${formatNumber(value, digits)}`

/**
 * A price per kg, per bag, per unit, or per worker-day -- where the paise are the information.
 *
 * Fertiliser at ₹66.00/kg and ₹66.49/kg are different purchases; rounded, they are the same number.
 * The blended ₹1,828.50/kg that exposed the calcium nitrate mispricing would have read ₹1,829 and
 * looked like an ordinary rate. Anything divided by a quantity keeps its decimals; anything summed
 * into a total does not.
 *
 * Per-acre figures are NOT unit prices in this sense -- ₹1,24,500/acre is a total wearing a
 * denominator, and a rupee is nothing against it.
 */
export const formatUnitPrice = (value: number) => formatCurrency(value, 2)
