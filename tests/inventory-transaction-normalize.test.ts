import { describe, expect, it } from "vitest"

import {
  coerceNonNegativeNumber,
  ensureTransactionSafety,
  normalizeQuantityValue,
} from "@/components/inventory-system/transaction-normalize"
import type { Transaction } from "@/lib/inventory-types"

const tx = (partial: Partial<Transaction>) => partial as Transaction

describe("normalizeQuantityValue", () => {
  it("rounds to paise", () => {
    expect(normalizeQuantityValue(12.3456)).toBe(12.35)
    expect(normalizeQuantityValue("7.891")).toBe(7.89)
  })

  it("rounds a half-paise up rather than losing it to binary representation", () => {
    // The reason for `+ Number.EPSILON`: plain Math.round(1.005 * 100) / 100 is 1, because 1.005
    // is stored as 1.00499999999999989.
    expect(normalizeQuantityValue(1.005)).toBe(1.01)
    expect(normalizeQuantityValue(8.615)).toBe(8.62)
  })

  it("treats empty, null and undefined as no usable value", () => {
    expect(normalizeQuantityValue("")).toBeNull()
    expect(normalizeQuantityValue(null)).toBeNull()
    expect(normalizeQuantityValue(undefined)).toBeNull()
  })

  it("refuses negatives — stock does not move backwards, a deplete is its own type", () => {
    expect(normalizeQuantityValue(-1)).toBeNull()
    expect(normalizeQuantityValue("-0.01")).toBeNull()
  })

  it("refuses anything non-finite, including text a user can actually type", () => {
    expect(normalizeQuantityValue("abc")).toBeNull()
    expect(normalizeQuantityValue(Number.POSITIVE_INFINITY)).toBeNull()
    expect(normalizeQuantityValue(Number.NaN)).toBeNull()
  })

  it("keeps zero as zero, which is not the same as no value", () => {
    expect(normalizeQuantityValue(0)).toBe(0)
    expect(normalizeQuantityValue("0")).toBe(0)
  })
})

describe("coerceNonNegativeNumber", () => {
  it("leaves a cleared box as an empty string, so it does not re-render as 'null'", () => {
    expect(coerceNonNegativeNumber("")).toBe("")
    expect(coerceNonNegativeNumber("   ")).toBe("")
  })

  it("normalizes anything else the same way as the quantity rule", () => {
    expect(coerceNonNegativeNumber("4.567")).toBe(4.57)
    expect(coerceNonNegativeNumber("-3")).toBeNull()
  })
})

describe("ensureTransactionSafety — the money fields", () => {
  /**
   * The rule this encodes: `price` in the form means the TOTAL paid for the batch, not a per-unit
   * rate. Getting it backwards values fifty bags at the price of one, which understates the books
   * silently — nothing looks wrong until a depletion books almost nothing.
   */
  it("loads the stored batch total into price, not the per-unit rate", () => {
    // total_cost deliberately NOT equal to price × quantity — a negotiated total, delivery
    // included. Equal values make this test pass under either precedence, which is how it was
    // written first: 50 × 60 == 3000 proves nothing about which side won.
    const result = ensureTransactionSafety(tx({ quantity: 50, price: 60, total_cost: 2800 }))
    expect(result.price).toBe(2800)
    expect(result.total_cost).toBe(2800)
  })

  it("falls back to rate × quantity for rows written before total_cost was populated", () => {
    const result = ensureTransactionSafety(tx({ quantity: 50, price: 60, total_cost: 0 }))
    expect(result.price).toBe(3000)
  })

  it("does not invent a total when the rate is known but the quantity is not", () => {
    const result = ensureTransactionSafety(tx({ quantity: "", price: 60, total_cost: 0 }))
    expect(result.price).toBe(0)
  })

  it("never yields NaN for a transaction missing the price keys entirely", () => {
    // Unreachable from the API, which COALESCEs both columns — this guards the next caller.
    const result = ensureTransactionSafety(tx({ item_type: "DAP", quantity: 10 }))
    expect(result.total_cost).toBe(0)
    expect(result.price).toBe(0)
    expect(Number.isNaN(result.total_cost)).toBe(false)
  })

  it("survives a null transaction", () => {
    const result = ensureTransactionSafety(null)
    expect(result.total_cost).toBe(0)
    expect(result.price).toBe(0)
    expect(result.item_type).toBe("")
  })
})

describe("ensureTransactionSafety — the other fields", () => {
  it("keeps an empty quantity empty rather than calling it a movement of zero", () => {
    expect(ensureTransactionSafety(tx({ quantity: "" })).quantity).toBe("")
  })

  it("rounds a supplied quantity and defaults a missing one to zero", () => {
    expect(ensureTransactionSafety(tx({ quantity: 3.456 })).quantity).toBe(3.46)
    expect(ensureTransactionSafety(tx({})).quantity).toBe(0)
  })

  it("trims the item type, so ' DAP ' and 'DAP' are not two different items", () => {
    expect(ensureTransactionSafety(tx({ item_type: "  DAP  " })).item_type).toBe("DAP")
  })

  it("defaults to a deplete in kg", () => {
    const result = ensureTransactionSafety(tx({}))
    expect(result.transaction_type).toBe("deplete")
    expect(result.unit).toBe("kg")
  })

  it("attributes the row to the signed-in user when it carries no author", () => {
    expect(ensureTransactionSafety(tx({}), { fallbackUserId: "manoj" }).user_id).toBe("manoj")
  })

  it("does not overwrite an author the row already has", () => {
    expect(ensureTransactionSafety(tx({ user_id: "kab" }), { fallbackUserId: "manoj" }).user_id).toBe("kab")
  })

  it("falls back to 'unknown' when nobody is signed in", () => {
    expect(ensureTransactionSafety(tx({}), { fallbackUserId: null }).user_id).toBe("unknown")
    expect(ensureTransactionSafety(tx({})).user_id).toBe("unknown")
  })

  it("normalizes an absent location to null rather than leaving it undefined", () => {
    expect(ensureTransactionSafety(tx({})).location_id).toBeNull()
    expect(ensureTransactionSafety(tx({ location_id: "loc-1" })).location_id).toBe("loc-1")
  })

  it("gives a dateless transaction today's date rather than an empty one", () => {
    expect(ensureTransactionSafety(tx({})).transaction_date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
