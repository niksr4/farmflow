/**
 * What a revaluation row looks like, in one place.
 *
 * Correcting an item's price does not write a correction — it writes a DEPLETE AND A RESTOCK at
 * the entire holding, so the weighted average lands on the new figure. Both rows carry real money
 * and neither is trade: nothing was bought, nothing was consumed, the estate's stock did not move.
 *
 * Any total that counts them is describing a price edit as a purchase. That has cost real numbers:
 * Rs 105.78 crore of phantom depletion and Rs 64.42 crore of phantom purchases on HoneyFarm,
 * mostly from one item repriced three times in four minutes. Stock purchases read Rs 14,86,864
 * against a true Rs 6,44,431.
 *
 * THERE ARE TWO SPELLINGS AND YOU NEED BOTH.
 *
 *   "Price correction (...)"      what the revalue block writes today
 *   "Price updated from ... to"   what older rows carry — 59 of them, all HoneyFarm, Rs 8.42 lakh
 *                                 of restock and Rs 8.63 lakh of deplete
 *
 * Excluding only one spelling is not a partial fix, it is a silent wrong answer, and it has
 * happened before. They live here together so a third spelling is added once rather than hunted
 * through six SQL strings in three files.
 *
 * ⚠ THIS IS FOR MONEY TOTALS ONLY. Row-level readers must keep these rows: the ledger replay in
 * lib/inventory-ledger.ts balances against them, the reconciliation check replays them, and the
 * inventory export shows them with their notes so a reader can see what they were. Filtering them
 * out of a balance would break the very reconciliation that proves the balance.
 */

/** Note prefixes a revaluation row is written with. Matched case-insensitively, as a prefix. */
export const REVALUATION_NOTE_PREFIXES = ["Price updated", "Price correction"] as const

/**
 * SQL fragment excluding revaluation rows from an aggregate over `transaction_history`.
 *
 * Takes no parameters and interpolates no user input — it is a constant string, safe to embed in
 * a query built with `sql.query(...)` alongside `$n` placeholders.
 */
export const EXCLUDE_REVALUATION_SQL = REVALUATION_NOTE_PREFIXES.map(
  (prefix) => `AND COALESCE(notes, '') NOT ILIKE '${prefix}%'`,
).join("\n          ")

/** The same test, for rows already in hand. */
export function isRevaluationNote(notes: unknown): boolean {
  const text = String(notes ?? "").trimStart().toLowerCase()
  return REVALUATION_NOTE_PREFIXES.some((prefix) => text.startsWith(prefix.toLowerCase()))
}
