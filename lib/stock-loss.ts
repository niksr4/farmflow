/**
 * A depletion recorded on the Inventory tab has to reach a cost line.
 *
 * Migration 129 created `124 Stock Loss & Wastage` and its header describes depletion landing
 * there "valued from the average cost like any other usage, visible in Costs, and reaching the
 * P&L". That was the intent and it was never wired up: the code was seeded, nothing wrote it, and
 * a manual depletion stayed a bare stock movement. Production carried 195 of them -- 166 on
 * HoneyFarm, 27 on Seshagiri -- stock that cost real money and landed on no cost line. That is the
 * same "built but unreachable" fault as the muster allocations that saved and counted nowhere.
 *
 * This is deliberately dependency-free and lives outside lib/server: the reason list and the note
 * format are needed by the Inventory drawer in the browser as well as by the write path, and a
 * second copy of either would drift the moment one side was edited.
 *
 * The link between expenses and stock already ran one way: an expense creates a tagged depletion
 * (`[expense_id:N]` in the notes). This closes the other direction, which means the loop has to be
 * cut deliberately in two places:
 *
 *   1. An expense-originated depletion must not mint a second expense. That is what
 *      `isExpenseOriginatedDepletion` guards -- it reads the same tag the expense route writes.
 *   2. The expense this module creates deliberately leaves `inventory_item_type` and
 *      `inventory_quantity` NULL. Those columns are what the expense route's own machinery keys
 *      off to plan a stock movement, so setting them would have an edit of the loss expense
 *      deplete the stock a second time. The item and quantity live in the note instead -- less
 *      structured, but it keeps this row out of that path entirely.
 */

export const STOCK_LOSS_CODE = "124"
export const STOCK_LOSS_ACTIVITY = "Stock Loss & Wastage"

/** The tag the expense route writes into a depletion's notes. Must stay in step with it. */
const EXPENSE_TAG_REGEX = /\[expense_id:([^\]]+)\]/i

export const isExpenseOriginatedDepletion = (notes: string | null | undefined) =>
  EXPENSE_TAG_REGEX.test(String(notes || ""))

/**
 * A revaluation is not a loss, and must never mint a cost line.
 *
 * Correcting an item's price is written as a deplete-then-restock pair of the SAME quantity at the
 * old then the new price (see the revalue block in inventory-system.tsx). Nothing leaves the shed;
 * the two halves cancel. But the deplete half looks exactly like any other depletion to the rule
 * below, so it was expensing the entire value of the stock every time somebody fixed a price.
 *
 * HoneyFarm on 2026-08-29: three attempts to correct one calcium-nitrate price produced three
 * stock-loss expenses of Rs 41.25 crore, Rs 64.38 crore and Rs 21,512 -- Rs 105.64 crore against
 * an estate whose real annual costs are around Rs 36 lakh. Each retry made it worse, because each
 * correction depleted at the previous (already wrong) price.
 *
 * The season summary and the balance sheet already exclude these movements by note prefix; this
 * rule did not. Matching on the note is fragile and matching on nothing was catastrophic -- the
 * note is written by one place (the revalue block) and read by three, so it is at least a contract
 * with a single author. Both spellings are covered: "Price correction" is current, "Price updated"
 * is what older rows carry.
 */
const REVALUATION_NOTE_REGEX = /^\s*price\s+(correction|updated)/i

export const isRevaluationDepletion = (notes: string | null | undefined) =>
  REVALUATION_NOTE_REGEX.test(String(notes || ""))

/** Every reason a depletion must NOT book a cost line. */
export const shouldSkipStockLoss = (notes: string | null | undefined) =>
  isExpenseOriginatedDepletion(notes) || isRevaluationDepletion(notes)

/**
 * Why the stock left, in the estate's words. Free text was the alternative and it would have gone
 * mostly empty -- these are the four cases that actually came up in HoneyFarm's existing notes.
 */
export const STOCK_LOSS_REASONS = [
  { value: "spillage", label: "Spilt or damaged" },
  { value: "short_count", label: "Short on a stock count" },
  { value: "expired", label: "Expired or unusable" },
  { value: "correction", label: "Correcting an earlier entry" },
  { value: "other", label: "Other" },
] as const

export type StockLossReason = (typeof STOCK_LOSS_REASONS)[number]["value"]

export const resolveStockLossReasonLabel = (reason: string | null | undefined) =>
  STOCK_LOSS_REASONS.find((r) => r.value === String(reason || "").trim())?.label || "Not stated"

/**
 * The note carries what the expense row itself cannot: which item, how much, and why. Whoever
 * opens the Costs tab in March needs to read this line and know what happened without having to
 * cross-reference the inventory ledger by date.
 */
export const buildStockLossNote = (input: {
  itemType: string
  quantity: number
  unit: string
  reason?: string | null
  userNotes?: string | null
}) => {
  const qty = Number(input.quantity)
  const amount = Number.isFinite(qty) ? Number(qty.toFixed(2)) : input.quantity
  const parts = [
    `Stock loss: ${amount} ${input.unit || "unit"} ${input.itemType}`.trim(),
    resolveStockLossReasonLabel(input.reason),
  ]
  const extra = String(input.userNotes || "").trim()
  if (extra) parts.push(extra)
  return parts.join(" — ")
}

/**
 * Depletions are valued at the slot's running weighted average, so an item nobody ever priced
 * values its own loss at zero. We still write the row: a zero-rupee cost line is a visible, and
 * therefore fixable, statement that stock left and nobody knows what it was worth. Suppressing it
 * would put us back to the loss reaching nothing at all, which is the bug being fixed. Callers
 * surface this flag so the UI can say so at the moment of entry rather than leaving it to be
 * discovered in the Costs tab.
 */
export const isUnvaluedLoss = (totalCost: number) => !(Number(totalCost) > 0)
