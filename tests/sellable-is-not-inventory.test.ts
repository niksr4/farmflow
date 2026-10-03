import { describe, expect, it } from "vitest"
import { summariseAvailability } from "@/components/sales/coffee-bags"
import type { InventoryBreakdown } from "@/components/sales/types"

/**
 * "AVAILABLE TO SELL" AND "STOCK ON HAND" ARE DIFFERENT NUMBERS.
 *
 * All three figures here were wrong the first time the `unspecified` bucket was added, and nothing
 * noticed, because they were inline in a 2,000-line component:
 *
 *   - the sellable headline counted unspecified kilos, which the sale form cannot dispose of -- it
 *     offers parchment or cherry and checks stock for the form chosen. The writer would be told to
 *     sell something and then refused, with no explanation.
 *   - the overdrawn figure skipped an overdrawn unspecified position. The per-type clamp floors
 *     availability at zero, so the overdraw did not show up small -- it vanished.
 *   - the dispatch tab's headline sums skipped the buckets too, which put the bags back in the hole
 *     the bucket exists to get them out of.
 *
 * ⚠ THE PROPERTY THAT PROTECTS REAL TENANTS IS THE LAST TEST: for canonical data, sellable equals
 * available and unclassified is zero, so nothing on their screen moves. Verified against production
 * on 2026-10-03 -- every bag_type any real tenant has written is one of the two canonical spellings.
 */

const breakdown = (
  cherry: [number, number],
  parchment: [number, number],
  unspecified: [number, number] = [0, 0],
): InventoryBreakdown => ({
  cherry: { bags: cherry[0], kgs: cherry[1] },
  parchment: { bags: parchment[0], kgs: parchment[1] },
  unspecified: { bags: unspecified[0], kgs: unspecified[1] },
  total: {
    bags: cherry[0] + parchment[0] + unspecified[0],
    kgs: cherry[1] + parchment[1] + unspecified[1],
  },
})

const TYPES = ["Arabica", "Robusta"] as const

describe("sellable stock is not the same as stock on hand", () => {
  it("keeps unclassified kilos in inventory but out of the sellable headline", () => {
    const available = {
      Arabica: breakdown([0, 0], [10, 500], [2, 100]),
      Robusta: breakdown([4, 200], [0, 0]),
    }
    const empty = { Arabica: breakdown([0, 0], [0, 0]), Robusta: breakdown([0, 0], [0, 0]) }
    const t = summariseAvailability(TYPES, empty, empty, available)

    expect(t.totalAvailable, "inventory counts every kilo on hand").toBe(800)
    expect(t.totalSellable, "the sale form can only dispose of parchment and cherry").toBe(700)
    expect(t.totalUnclassified, "and the gap is named rather than hidden").toBe(100)
    expect(t.totalAvailable - t.totalSellable).toBe(t.totalUnclassified)
    // Bags follow the same split.
    expect(t.totalAvailableBags).toBe(16)
    expect(t.totalSellableBags).toBe(14)
  })

  it("reports an overdrawn unspecified position instead of losing it", () => {
    /**
     * 50 kg sold under an unreadable form with no matching receipt. The per-type availability clamp
     * floors this at zero, so if overdrawn skipped the bucket the screen would report nothing wrong.
     */
    const received = { Arabica: breakdown([0, 0], [0, 0], [0, 0]), Robusta: breakdown([0, 0], [0, 0]) }
    const sold = { Arabica: breakdown([0, 0], [0, 0], [1, 50]), Robusta: breakdown([0, 0], [0, 0]) }
    const available = { Arabica: breakdown([0, 0], [0, 0]), Robusta: breakdown([0, 0], [0, 0]) }
    const t = summariseAvailability(TYPES, received, sold, available)

    expect(t.totalOverdrawn, "selling an unreadable form beyond receipts is still overdrawn").toBe(50)
    expect(t.totalOverdrawnBags).toBe(1)
    expect(t.totalAvailable, "and availability is still floored at zero").toBe(0)
  })

  it("counts an overdraw on every form, not just the one it is told about", () => {
    const received = { Arabica: breakdown([1, 50], [1, 50], [1, 50]), Robusta: breakdown([0, 0], [0, 0]) }
    const sold = { Arabica: breakdown([3, 150], [2, 100], [2, 100]), Robusta: breakdown([0, 0], [0, 0]) }
    const available = { Arabica: breakdown([0, 0], [0, 0]), Robusta: breakdown([0, 0], [0, 0]) }
    const t = summariseAvailability(TYPES, received, sold, available)
    // cherry 100 over, parchment 50 over, unspecified 50 over
    expect(t.totalOverdrawn).toBe(200)
    expect(t.totalOverdrawnBags).toBe(4)
  })

  it("is identical to the old figures for canonical data, so no real tenant's screen moves", () => {
    /**
     * HoneyFarm's actual shape on 2026-10-03, read from production: Arabica parchment only, Robusta
     * both forms, nothing unreadable anywhere. sellable must equal available and unclassified must be
     * zero, or this change puts a warning tone and a different headline on a clean estate.
     */
    const received = {
      Arabica: breakdown([0, 0], [138, 6872]),
      Robusta: breakdown([280, 13953], [588, 29370]),
    }
    const sold = {
      Arabica: breakdown([0, 0], [138, 6900]),
      Robusta: breakdown([249, 12435], [537, 26865]),
    }
    // Availability clamps each form at zero, as the tab does.
    const available = {
      Arabica: breakdown([0, 0], [0, 0]),
      Robusta: breakdown([31, 1518], [51, 2505]),
    }
    const t = summariseAvailability(TYPES, received, sold, available)

    expect(t.totalUnclassified, "nothing unreadable, so nothing unclassified").toBe(0)
    expect(t.totalSellable, "sellable and inventory coincide for canonical data").toBe(t.totalAvailable)
    expect(t.totalSellableBags).toBe(t.totalAvailableBags)
    expect(t.totalSellable).toBe(1518 + 2505)

    /**
     * ⚠ AND A REAL NUANCE WORTH PINNING: HoneyFarm's Arabica parchment sales (6,900 kg) exceed
     * confirmed receipts (6,872 kg) by 28 kg, so the overdrawn figure is 28 rather than 0. The bag
     * counts match exactly (138 and 138), so this is the per-bag weight estimate differing slightly
     * from the weighed total, not a missing dispatch. It is reported rather than hidden, which is the
     * behaviour to keep -- a silent zero here would be the bug.
     */
    expect(t.totalOverdrawn).toBe(28)
    expect(t.totalOverdrawnBags, "the bag counts reconcile exactly").toBe(0)
  })
})
