import type { Transaction } from "@/lib/inventory-types"

import { createDefaultTransaction, safeGet } from "./utils"

/**
 * Quantity and price normalisation for the movement form.
 *
 * Lifted out of components/inventory-system.tsx, where it sat in the middle of a five-thousand-line
 * component and could only be exercised by driving the UI. It decides two money figures -- what a
 * movement is worth, and which of `total_cost` or `price x quantity` wins when they disagree -- and
 * "the arithmetic that values stock has no tests" is the shape of every expensive bug this project
 * has had. Nothing here changed in the move; the tests are new.
 */

/**
 * Round to paise and refuse anything that is not a usable non-negative number.
 *
 * `null` for empty, negative and non-finite input alike: callers treat null as "no usable value"
 * and show their own message. The `+ Number.EPSILON` before rounding is the standard guard against
 * binary representation eating a half-paise (1.005 rounds to 1.00 without it).
 */
export const normalizeQuantityValue = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return Number((Math.round((numeric + Number.EPSILON) * 100) / 100).toFixed(2))
}

/**
 * Input-field flavour of the above: an empty box stays an empty string rather than becoming null,
 * so a half-typed field does not re-render as "null".
 */
export const coerceNonNegativeNumber = (value: string) => {
  if (!value.trim()) return ""
  return normalizeQuantityValue(value)
}

/**
 * Fill in every field the API and the dialogs assume exist, without trusting any of them.
 *
 * `quantity` deliberately preserves "" rather than coercing to 0 -- an empty quantity box is not a
 * movement of zero, and submit rejects it downstream.
 */
export const ensureTransactionSafety = (
  transaction: Transaction | null,
  options: { fallbackUserId?: string | null } = {},
): Transaction => {
  /**
   * `?? 0` before Number(), not safeGet() after it.
   *
   * The original read `safeGet(Number(t?.total_cost), 0)`, and that fallback can never fire:
   * Number(undefined) is NaN, and NaN is neither null nor undefined, so safeGet hands it straight
   * back. A transaction object missing the key entirely came out with total_cost: NaN and
   * price: NaN.
   *
   * Not reachable today -- app/api/transactions-neon/route.ts COALESCEs both columns in SQL and
   * again in JS (`Number(row.price) || 0`), so every row arrives with both keys present. Fixed
   * anyway because the only inputs whose behaviour changes are the ones that produced NaN, and
   * NaN was never the intent.
   */
  const numeric = (value: unknown) => Number(value ?? 0)
  const safeQuantity = transaction?.quantity === "" ? "" : safeGet(normalizeQuantityValue(transaction?.quantity), 0)
  return {
    item_type: String(safeGet(transaction?.item_type, "")).trim(),
    quantity: safeQuantity,
    transaction_type: safeGet(transaction?.transaction_type, "deplete"),
    notes: safeGet(transaction?.notes, ""),
    transaction_date: safeGet(transaction?.transaction_date, createDefaultTransaction().transaction_date),
    user_id: safeGet(transaction?.user_id, options.fallbackUserId || "unknown"),
    /**
     * The price field now MEANS the batch total everywhere it is edited, so an existing row has
     * to be loaded as one. Loading the stored per-unit rate under a "Total price paid" label
     * would show a wrong number and then save it as the total on the next keystroke -- a 50 kg
     * restock at Rs 60/kg reopening as "Rs 60 paid" and being written back as Rs 60 for the lot.
     *
     * total_cost is preferred because it is the column the weighted-average replay actually
     * reads; rate x quantity is the fallback for rows written before it was populated.
     */
    price: numeric(transaction?.total_cost) || numeric(transaction?.price) * (Number(safeQuantity) || 0),
    total_cost: numeric(transaction?.total_cost),
    unit: safeGet(transaction?.unit, "kg"),
    location_id: transaction?.location_id ?? null,
    location_name: transaction?.location_name ?? undefined,
    location_code: transaction?.location_code ?? undefined,
    id: transaction?.id,
  } as Transaction
}
