import { describe, expect, it } from "vitest"

import {
  buildTransactionPricing,
  resolveItemValue,
  summariseInventoryValue,
} from "../lib/inventory-valuation"
import type { InventoryItem, Transaction } from "../lib/inventory-types"

/**
 * The arithmetic behind a money figure that a customer queried.
 *
 * KAB asked on 2026-09-08 why DAP showed Rs 18.44 when he had just bought it at Rs 27. The answer
 * was a correct weighted average over a corrupted input: a 2,500 kg restock recorded with no price
 * at all. This module is the display side of that, and it had no test -- answering the question
 * meant reading a 5,465-line component to find out which of three sources the number came from.
 */

const tx = (over: Partial<Transaction>): Transaction =>
  ({ item_type: "DAP", quantity: 100, price: 27, total_cost: 2700, ...over }) as Transaction

const item = (over: Partial<InventoryItem>): InventoryItem =>
  ({ name: "DAP", quantity: 100, avg_price: 27, total_cost: 2700, unit: "kg", ...over }) as InventoryItem

describe("a movement with no price is skipped, not counted as free", () => {
  it("ignores a zero-priced restock instead of averaging it in", () => {
    // THE DAP BUG, in miniature. 3,150 kg at Rs 27 and 2,500 kg at nothing is not Rs 15 a kilo --
    // the second lot's price is unknown, not zero. Averaging it in invents a discount.
    const pricing = buildTransactionPricing([
      tx({ quantity: 3150, price: 27, total_cost: 85050 }),
      tx({ quantity: 2500, price: 0, total_cost: 0 }),
    ])
    expect(pricing.DAP.avgPrice).toBe(27)
  })

  it("backs a unit price out of the line total when only that is recorded", () => {
    const pricing = buildTransactionPricing([tx({ quantity: 50, price: 0, total_cost: 1350 })])
    expect(pricing.DAP.avgPrice).toBe(27)
  })

  it("weights by quantity, not by number of movements", () => {
    const pricing = buildTransactionPricing([
      tx({ quantity: 900, price: 10, total_cost: 9000 }),
      tx({ quantity: 100, price: 20, total_cost: 2000 }),
    ])
    expect(pricing.DAP.avgPrice).toBe(11) // not 15
  })

  it("survives junk without producing NaN", () => {
    const pricing = buildTransactionPricing([
      tx({ quantity: 0, price: 27 }),
      tx({ quantity: -5, price: 27 }),
      tx({ quantity: 10, price: Number.NaN, total_cost: Number.NaN }),
      tx({ item_type: "", quantity: 10, price: 5 }),
    ])
    expect(pricing.DAP).toBeUndefined()
  })
})

describe("the fallback order is most-trusted-first", () => {
  const pricing = buildTransactionPricing([tx({ quantity: 100, price: 99, total_cost: 9900 })])

  it("prefers the stored average over anything derived", () => {
    expect(resolveItemValue(item({ avg_price: 27 }), pricing).avgPrice).toBe(27)
  })

  it("recomputes from the stored total when the average is missing", () => {
    expect(resolveItemValue(item({ avg_price: 0, total_cost: 3000, quantity: 100 }), pricing).avgPrice).toBe(30)
  })

  it("falls back to the movement average only when the row knows nothing", () => {
    expect(resolveItemValue(item({ avg_price: 0, total_cost: 0, quantity: 100 }), pricing).avgPrice).toBe(99)
  })

  it("treats a zero price as unknown, never as free", () => {
    // Guarding on presence instead of `> 0` is the bug this is here to prevent: `avg_price: 0` is
    // what a never-priced item actually looks like, and 0 is falsy but also a real-looking number.
    const value = resolveItemValue(item({ avg_price: 0, total_cost: 0, quantity: 100 }), {})
    expect(value.avgPrice).toBe(0)
    expect(value.totalValue).toBe(0)
  })

  it("keeps the stored total rather than recomputing it", () => {
    // A stored total is what the ledger says was paid; avg x qty can drift from it after rounding.
    expect(resolveItemValue(item({ avg_price: 27, total_cost: 2699.5, quantity: 100 }), pricing).totalValue).toBe(2699.5)
  })
})

describe("the total says how much of itself is guesswork", () => {
  it("counts only stock on hand as unpriced", () => {
    // A depleted item with no price cannot be fixed by anybody and must not inflate the warning.
    const summary = summariseInventoryValue(
      [
        item({ name: "DAP", quantity: 100, avg_price: 27, total_cost: 2700 }),
        item({ name: "Urea", quantity: 3000, avg_price: 0, total_cost: 0 }),
        item({ name: "Glycil", quantity: 0, avg_price: 0, total_cost: 0 }),
      ],
      {},
    )
    expect(summary.heldCount).toBe(2)
    expect(summary.unpricedCount).toBe(1)
    expect(summary.totalValue).toBe(2700)
    expect(summary.caveat).toContain("1 of 2")
  })

  it("says nothing when every held item is priced", () => {
    const summary = summariseInventoryValue([item({ quantity: 100, avg_price: 27, total_cost: 2700 })], {})
    expect(summary.caveat).toBeNull()
  })

  it("says nothing when the shed is empty, rather than 0 of 0", () => {
    expect(summariseInventoryValue([], {}).caveat).toBeNull()
    expect(summariseInventoryValue([item({ quantity: 0, avg_price: 0, total_cost: 0 })], {}).caveat).toBeNull()
  })
})
