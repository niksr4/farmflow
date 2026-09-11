import { describe, expect, it } from "vitest"

import {
  isPricedPurchase,
  isUnpricedRestock,
  planPriceBackfill,
  suggestedRate,
  unpricedSummary,
} from "@/lib/inventory-price-backfill"
import { replayInventoryLedger } from "@/lib/inventory-ledger"

/**
 * Filling in the restocks that were never priced, and nothing else.
 *
 * Every fixture below is a real production shape, because the interesting cases here are not the
 * ones you would invent: an item whose "average priced restock" is four hundred times its true
 * cost, an item with nothing to learn a rate from at all, and an item whose zeroes sit in between
 * perfectly good prices.
 */

const restock = (id: number, quantity: number, total_cost: number, notes = "") => ({
  id,
  transaction_type: "restock",
  quantity,
  total_cost,
  notes,
})
const deplete = (id: number, quantity: number) => ({
  id,
  transaction_type: "deplete",
  quantity,
  total_cost: 0,
  notes: "",
})

describe("which rows qualify", () => {
  it("an unpriced restock is a restock with quantity and no money", () => {
    expect(isUnpricedRestock(restock(1, 60, 0))).toBe(true)
    expect(isUnpricedRestock(restock(2, 60, 6724.8))).toBe(false)
  })

  it("a zero-quantity row is left alone — no rate gives it a value", () => {
    expect(isUnpricedRestock(restock(3, 0, 0))).toBe(false)
  })

  it("depletions are never touched, priced or not", () => {
    // Filling a depletion would invent consumption that never happened. The replay values
    // depletions at the running average; they carry no price of their own to restore.
    expect(isUnpricedRestock(deplete(4, 60))).toBe(false)
    expect(isUnpricedRestock({ ...deplete(5, 60), total_cost: 0 })).toBe(false)
  })

  it("'restocking' counts as well as 'restock'", () => {
    // Both spellings are live in transaction_history; isRestockTransaction is the shared test.
    expect(isUnpricedRestock({ ...restock(6, 10, 0), transaction_type: "restocking" })).toBe(true)
  })

  it("a revaluation restock is priced, but is not a purchase", () => {
    const revaluation = restock(7, 3259.5, 643832737.5, "Price correction (₹1,26,569.46 -> ₹1,97,525 per kg)")
    expect(isUnpricedRestock(revaluation)).toBe(false)
    expect(isPricedPurchase(revaluation)).toBe(false)
  })

  it("and so is the older spelling of one", () => {
    const old = restock(8, 10650, 383400, "Price updated from ₹34.00 to ₹36.00. Quantity adjusted by 10650")
    expect(isPricedPurchase(old)).toBe(false)
  })
})

describe("the suggested rate", () => {
  it("is the median of genuine purchases, not the mean", () => {
    /**
     * HoneyFarm / Calcium nitrate, verbatim from production. Eight priced restocks, five of them
     * revaluations, one at Rs 1,97,525 per kg. The mean of all eight is Rs 46,742.96 — the figure
     * a naive AVG() reports, and four hundred times the truth. The median of the three real
     * purchases is Rs 120.
     */
    const rows = [
      restock(1, 25, 0, "New item added: Calcium nitrate"),
      restock(2, 25, 3000, "Price updated from ₹0.00 to ₹120.00. Quantity adjusted by 25"),
      restock(3, 759.5, 53165, "Price correction (₹1,828.36 -> ₹70 per kg)"),
      restock(4, 750, 1387500),
      restock(5, 2500, 165000),
      restock(6, 3259.5, 643832737.5, "Price correction (₹1,26,569.46 -> ₹1,97,525 per kg)"),
      restock(7, 3259.5, 21512.7, "Price correction (₹1,97,525 -> ₹6.60 per kg)"),
      restock(8, 3259.5, 197525.7, "Price correction (₹6.60 -> ₹60.60 per kg)"),
    ]
    // Genuine purchases: 1850 (750 @ 1387500) and 66 (2500 @ 165000). Median of two = 958.
    expect(suggestedRate(rows)).toBe(958)
    // Not the mean of everything, which is what an AVG over the same rows gives.
    expect(suggestedRate(rows)).toBeLessThan(1000)
  })

  it("picks the middle rate for HoneyFarm's petrol", () => {
    // The ten genuine priced petrol restocks on production, rates only.
    const rates = [104, 104, 107, 109, 111, 111, 112.08, 112, 112.08, 112]
    const rows = rates.map((r, i) => restock(i + 1, 10, r * 10))
    const median = suggestedRate(rows)!
    expect(median).toBeGreaterThanOrEqual(111)
    expect(median).toBeLessThanOrEqual(112)
  })

  it("is null when the item has never been bought at a known price", () => {
    // Seven of Laxmi's slots. A suggestion invented from nothing arrives with the same authority
    // as one that means something, so there must not be one.
    expect(suggestedRate([restock(1, 3000, 0), deplete(2, 500)])).toBeNull()
    expect(suggestedRate([])).toBeNull()
  })

  it("ignores a priced row whose quantity is zero rather than dividing by it", () => {
    expect(suggestedRate([restock(1, 0, 500), restock(2, 10, 1000)])).toBe(100)
  })
})

describe("the plan", () => {
  it("fills only the unpriced rows and leaves the priced ones exactly as they were", () => {
    /**
     * The case the whole design turns on. HoneyFarm's petrol holds real Rs 111 and Rs 112.08
     * entries beside thirteen zeroes. A blanket rewrite to one rate erases four true facts to fix
     * thirteen missing ones.
     */
    const rows = [
      restock(1, 40, 0),
      restock(2, 60, 6660), // a real Rs 111 purchase
      restock(3, 30, 0),
      restock(4, 60, 6724.8), // a real Rs 112.08 purchase
    ]
    const plan = planPriceBackfill({ rows, rate: 110 })

    expect(plan.changes.map((c) => c.id)).toEqual([1, 3])
    expect(plan.rowCount).toBe(2)
    expect(plan.quantity).toBe(70)
    expect(plan.costAdded).toBe(70 * 110)
  })

  it("values the filled rows at quantity x rate, to the paisa", () => {
    const plan = planPriceBackfill({ rows: [restock(1, 36.4, 0)], rate: 350 })
    expect(plan.changes[0].newTotalCost).toBe(12740)

    const fractional = planPriceBackfill({ rows: [restock(1, 11.5, 0)], rate: 455.33 })
    expect(fractional.changes[0].newTotalCost).toBe(5236.3)
  })

  it("the preview IS the result — after equals a replay of the patched rows", () => {
    /**
     * Not a tautology worth skipping: the failure this forbids is a preview computed one way and
     * a write computed another, which is how "it said Rs 112 and saved Rs 55" happens. planned
     * `after` and an independent replay of the rows as written must be the same object.
     */
    const rows = [restock(1, 100, 0), restock(2, 100, 11000), deplete(3, 50)]
    const plan = planPriceBackfill({ rows, rate: 110 })

    const asWritten = rows.map((row) => {
      const change = plan.changes.find((c) => c.id === row.id)
      return change ? { ...row, total_cost: change.newTotalCost } : row
    })
    expect(plan.after).toEqual(replayInventoryLedger(asWritten))
  })

  it("fixes the average the estate owner described", () => {
    // "100 L at Rs 110 and 100 L unpriced shows Rs 55." It does, and after the fill it does not.
    const rows = [restock(1, 100, 11000), restock(2, 100, 0)]
    expect(replayInventoryLedger(rows).avgPrice).toBe(55)

    const plan = planPriceBackfill({ rows, rate: 110 })
    expect(plan.before.avgPrice).toBe(55)
    expect(plan.after.avgPrice).toBe(110)
    expect(plan.after.quantity).toBe(200)
  })

  it("never changes the quantity — only what it cost", () => {
    // The stock count is the number the estate trusts and has been operating on. This touches
    // money only; a fill that moved a balance would be a different and much more dangerous tool.
    const rows = [restock(1, 60, 0), deplete(2, 20), restock(3, 40, 4480), deplete(4, 15)]
    const plan = planPriceBackfill({ rows, rate: 112 })
    expect(plan.after.quantity).toBe(plan.before.quantity)
  })

  it("does nothing at all for a rate of zero or below", () => {
    // Filling at zero is what the rows already say. Refusing beats writing a no-op that still
    // rewrites history and still files an audit entry claiming a correction was made.
    for (const rate of [0, -5, Number.NaN]) {
      const plan = planPriceBackfill({ rows: [restock(1, 60, 0)], rate })
      expect(plan.rowCount, `rate ${rate} should change nothing`).toBe(0)
      expect(plan.after).toEqual(plan.before)
    }
  })

  it("leaves a slot with nothing to fill completely untouched", () => {
    const rows = [restock(1, 60, 6724.8), deplete(2, 20)]
    const plan = planPriceBackfill({ rows, rate: 112 })
    expect(plan.rowCount).toBe(0)
    expect(plan.after).toEqual(plan.before)
  })

  it("replays depletions in order rather than crediting them at the new rate", () => {
    /**
     * Order is the whole of average costing. 100 L unpriced, consume 50, then buy 100 at Rs 120:
     * before the fill the first 50 leave at Rs 0 and the balance is 150 L costing Rs 12,000
     * (Rs 80/L). Fill the first purchase at Rs 100 and those same 50 L leave at Rs 100 — the
     * balance is 150 L costing Rs 17,000, not 150 x Rs 110.
     */
    const rows = [restock(1, 100, 0), deplete(2, 50), restock(3, 100, 12000)]
    const plan = planPriceBackfill({ rows, rate: 100 })
    expect(plan.before.totalCost).toBe(12000)
    expect(plan.after.quantity).toBe(150)
    expect(plan.after.totalCost).toBe(17000)
    expect(plan.after.avgPrice).toBeCloseTo(113.3333, 3)
  })
})

describe("the summary shown before a rate is typed", () => {
  it("counts the rows and the quantity waiting to be priced", () => {
    // HoneyFarm / H.S.D on production: five unpriced restocks totalling 2,390 L.
    const rows = [
      restock(1, 55, 4895, "Price updated from ₹0.00 to ₹89.00. Quantity adjusted by 55"),
      restock(2, 400, 0, "Received"),
      restock(3, 400, 0),
      restock(4, 400, 0),
      restock(5, 400, 0),
      restock(6, 790, 0),
      restock(7, 110, 10670, "Price correction (₹0 -> ₹97 per L)"),
    ]
    const summary = unpricedSummary(rows)
    expect(summary.rowCount).toBe(5)
    expect(summary.quantity).toBe(2390)
    // Both priced rows are revaluations, so H.S.D has never been bought at a recorded price.
    expect(summary.pricedPurchaseCount).toBe(0)
    expect(suggestedRate(rows)).toBeNull()
  })
})
