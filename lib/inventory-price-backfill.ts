import { isRevaluationNote } from "@/lib/revaluation-notes"
import { isRestockTransaction, replayInventoryLedger, type LedgerBalance } from "@/lib/inventory-ledger"

/**
 * Put a price on the restocks that never got one — and only on those.
 *
 * THE PROBLEM, in the estate owner's words: "Instead of EACH restocking needing a price, can't
 * they just set the average price now if they forgot to price all the previous restocks, and then
 * when linked, all the quantity has value as it's being consumed."
 *
 * He is describing something real. 30 item/tenant slots on production carry at least one restock
 * entered with no price. Those zeroes drag the weighted average down for every later depletion:
 * 100 L at Rs 110 plus 100 L at nothing averages Rs 55, so every litre consumed afterwards is
 * costed at half what it cost. The stock count is right and the money is wrong, which is the
 * quietest kind of wrong — nothing looks broken on the screen where the mistake shows.
 *
 * WHAT THE APP CAN ALREADY DO, AND WHY IT IS NOT ENOUGH. Editing an item's average price works
 * exactly as he expects, and I verified that on dev: 150 L at Rs 120, then a 100 L purchase at
 * Rs 130, gives 250 L at Rs 124. But it gets there by writing a DEPLETE AND A RESTOCK at the
 * whole holding, and those rows carry money and look like trade. That is why three money reports
 * had to learn to filter them (lib/revaluation-notes.ts), and it is how HoneyFarm's Calcium
 * nitrate produced a Rs 64.38 crore restock row that then needed correcting twice more.
 *
 * SO THIS IS THE SAME IDEA, NARROWED. Fill in the rows that have NO price. Leave every priced row
 * exactly as it is. Three things follow:
 *
 *   - No revaluation pair is written, so no report has to learn to ignore anything new, and the
 *     ledger still replays to the balance the estate has been operating on.
 *   - Genuine price history survives. HoneyFarm's petrol has real Rs 104, Rs 109, Rs 111 and
 *     Rs 112.08 entries sitting beside thirteen zeroes; a blanket rewrite to one rate would erase
 *     four true facts to fix thirteen missing ones.
 *   - The arithmetic is the ledger's own. Nothing here re-implements average costing — it edits
 *     rows and hands them to replayInventoryLedger, which is what maintains current_inventory. A
 *     preview computed a second way is a preview that can disagree with the result.
 *
 * ⚠ IT EDITS HISTORY. That is the point and it is not free: a restock row's total_cost changes
 * from 0 to something. The alternative — appending a correction — is precisely the mechanism this
 * exists to avoid. The caller is responsible for the audit entry; every row it touches is returned
 * so the entry can name them.
 */

export type BackfillRow = {
  id: number | string
  transaction_type?: string | null
  quantity?: number | string | null
  total_cost?: number | string | null
  notes?: string | null
  transaction_date?: string | null
}

const num = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Round money to paise. Rates are per-unit and may be finer; totals are not. */
const money = (n: number) => Math.round(n * 100) / 100

/**
 * A restock that was recorded with no price at all.
 *
 * Zero, not "low": a cheap purchase is a fact and a missing one is a gap, and only the gap can be
 * filled without overwriting something a human said. A zero-quantity row is skipped too — there is
 * no rate that gives it a value, and multiplying by it just writes another zero.
 */
export function isUnpricedRestock(row: BackfillRow): boolean {
  return isRestockTransaction(row?.transaction_type) && num(row?.quantity) > 0 && num(row?.total_cost) <= 0
}

/** A restock that carries a real price and was a real purchase — not a revaluation. */
export function isPricedPurchase(row: BackfillRow): boolean {
  return (
    isRestockTransaction(row?.transaction_type) &&
    num(row?.quantity) > 0 &&
    num(row?.total_cost) > 0 &&
    !isRevaluationNote(row?.notes)
  )
}

/**
 * A rate to offer as the starting point, from what this item has genuinely cost before.
 *
 * MEDIAN, NOT MEAN, and revaluations excluded — those two choices are the whole function.
 *
 * HoneyFarm's Calcium nitrate has eight priced restocks. Their mean per-unit rate is Rs 46,742,
 * because five of the eight are revaluation rows and one of those is the Rs 1,97,525-per-kg row
 * from the run of corrections on 29 August. The median of the three genuine purchases is Rs 120.
 * A mean here would not be slightly off; it would suggest a number four hundred times the truth,
 * into a box whose whole purpose is to be accepted without much thought.
 *
 * Returns null when the item has never been bought at a known price — seven of Laxmi's slots are
 * in exactly that state. A suggestion invented from nothing is worse than none, because it arrives
 * with the same authority as one that means something.
 */
export function suggestedRate(rows: readonly BackfillRow[]): number | null {
  const rates = rows
    .filter(isPricedPurchase)
    .map((row) => num(row.total_cost) / num(row.quantity))
    .filter((rate) => Number.isFinite(rate) && rate > 0)
    .sort((a, b) => a - b)

  if (!rates.length) return null
  const mid = Math.floor(rates.length / 2)
  const median = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2
  return Math.round(median * 100) / 100
}

export type BackfillChange = {
  id: number | string
  quantity: number
  /** Always 0 today — kept explicit so the audit entry records what it replaced. */
  previousTotalCost: number
  newTotalCost: number
}

export type BackfillPlan = {
  /** Every row that would change, in the order they are replayed. */
  changes: BackfillChange[]
  /** Rows filled. */
  rowCount: number
  /** Quantity across those rows, in the item's own unit. */
  quantity: number
  /** Money this adds to the ledger. */
  costAdded: number
  /** The slot as it stands, and as it would stand. Both from replayInventoryLedger. */
  before: LedgerBalance
  after: LedgerBalance
}

/**
 * What filling the unpriced restocks at `rate` would do to this slot.
 *
 * `rows` must be the slot's WHOLE ledger in (transaction_date, id) order — restocks and
 * depletions both. Passing only the restocks would replay to a balance that never depletes, and
 * the preview would promise a quantity the estate does not have.
 *
 * The plan is the preview and the plan is the instruction: `changes` is what gets written, and
 * `after` is what re-replaying those same rows produces. They cannot drift apart because they are
 * computed from one array.
 */
export function planPriceBackfill(params: {
  rows: readonly BackfillRow[]
  rate: number
}): BackfillPlan {
  const rate = num(params.rate)
  const rows = params.rows ?? []

  const changes: BackfillChange[] = []
  const patched = rows.map((row) => {
    if (rate <= 0 || !isUnpricedRestock(row)) return row
    const quantity = num(row.quantity)
    const newTotalCost = money(quantity * rate)
    changes.push({
      id: row.id,
      quantity,
      previousTotalCost: num(row.total_cost),
      newTotalCost,
    })
    return { ...row, total_cost: newTotalCost }
  })

  return {
    changes,
    rowCount: changes.length,
    quantity: Math.round(changes.reduce((sum, c) => sum + c.quantity, 0) * 10000) / 10000,
    costAdded: money(changes.reduce((sum, c) => sum + (c.newTotalCost - c.previousTotalCost), 0)),
    before: replayInventoryLedger(rows),
    after: replayInventoryLedger(patched),
  }
}

/** Rows that would be filled, for a preview that has not been given a rate yet. */
export function unpricedSummary(rows: readonly BackfillRow[]): {
  rowCount: number
  quantity: number
  pricedPurchaseCount: number
} {
  const unpriced = rows.filter(isUnpricedRestock)
  return {
    rowCount: unpriced.length,
    quantity: Math.round(unpriced.reduce((sum, r) => sum + num(r.quantity), 0) * 10000) / 10000,
    pricedPurchaseCount: rows.filter(isPricedPurchase).length,
  }
}
