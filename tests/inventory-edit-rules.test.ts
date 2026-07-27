import { describe, expect, it } from "vitest"
import { isRestockType, projectSlotBalance, requiresRestockUnitPrice } from "@/lib/inventory-edit-rules"

describe("isRestockType", () => {
  it("accepts both stored spellings and rejects depletions", () => {
    expect(isRestockType("restock")).toBe(true)
    expect(isRestockType("Restocking")).toBe(true)
    expect(isRestockType("deplete")).toBe(false)
    expect(isRestockType("depleting")).toBe(false)
    expect(isRestockType(null)).toBe(false)
    expect(isRestockType(undefined)).toBe(false)
  })
})

describe("requiresRestockUnitPrice", () => {
  it("requires a price on a new zero-priced restock", () => {
    expect(
      requiresRestockUnitPrice({ nextType: "restock", nextPrice: 0, storedType: "deplete", storedPrice: 0 }),
    ).toBe(true)
  })

  it("exempts a row already stored as a zero-priced restock", () => {
    // The Laxmi case: a May purchase row stored at price 0, quantity being corrected
    // from 40 bags to 2000 kg. This has to be savable as a restock.
    expect(
      requiresRestockUnitPrice({ nextType: "restock", nextPrice: 0, storedType: "restock", storedPrice: 0 }),
    ).toBe(false)
  })

  it("still requires a price when a stored restock already had one", () => {
    // Clearing a real price back to zero is a regression, not a legacy row.
    expect(
      requiresRestockUnitPrice({ nextType: "restock", nextPrice: 0, storedType: "restock", storedPrice: 125 }),
    ).toBe(true)
  })

  it("never requires a price on a depletion", () => {
    expect(
      requiresRestockUnitPrice({ nextType: "deplete", nextPrice: 0, storedType: "restock", storedPrice: 125 }),
    ).toBe(false)
  })

  it("is satisfied by any positive price", () => {
    expect(
      requiresRestockUnitPrice({ nextType: "restock", nextPrice: "0.5", storedType: "deplete", storedPrice: 0 }),
    ).toBe(false)
  })

  it("treats unparseable and negative prices as missing", () => {
    for (const nextPrice of ["", null, undefined, "abc", -5]) {
      expect(
        requiresRestockUnitPrice({ nextType: "restock", nextPrice, storedType: "deplete", storedPrice: 0 }),
      ).toBe(true)
    }
  })
})

describe("projectSlotBalance", () => {
  it("moves the balance by twice the quantity when a restock becomes a depletion", () => {
    // 2000 kg DAP on hand, all of it from the row being edited.
    expect(
      projectSlotBalance({
        currentBalance: 2000,
        storedType: "restock",
        storedQuantity: 2000,
        nextType: "deplete",
        nextQuantity: 2000,
      }),
    ).toBe(-2000)
  })

  it("reports the shortfall for the exact edit that zeroed Laxmi's DAP", () => {
    // Stored as restock 40; saved as deplete 2000.
    expect(
      projectSlotBalance({
        currentBalance: 40,
        storedType: "restock",
        storedQuantity: 40,
        nextType: "deplete",
        nextQuantity: 2000,
      }),
    ).toBe(-2000)
  })

  it("leaves the balance unchanged when nothing material changes", () => {
    expect(
      projectSlotBalance({
        currentBalance: 500,
        storedType: "restock",
        storedQuantity: 100,
        nextType: "restock",
        nextQuantity: 100,
      }),
    ).toBe(500)
  })

  it("handles a corrected restock quantity", () => {
    // 40 -> 2000 as a restock adds the difference, no shortfall.
    expect(
      projectSlotBalance({
        currentBalance: 40,
        storedType: "restock",
        storedQuantity: 40,
        nextType: "restock",
        nextQuantity: 2000,
      }),
    ).toBe(2000)
  })

  it("handles editing a depletion's quantity", () => {
    expect(
      projectSlotBalance({
        currentBalance: 100,
        storedType: "deplete",
        storedQuantity: 50,
        nextType: "deplete",
        nextQuantity: 80,
      }),
    ).toBe(70)
  })

  it("treats a depletion turning into a restock as a gain", () => {
    expect(
      projectSlotBalance({
        currentBalance: 0,
        storedType: "deplete",
        storedQuantity: 130,
        nextType: "restock",
        nextQuantity: 130,
      }),
    ).toBe(260)
  })

  it("coerces missing numbers to zero", () => {
    expect(
      projectSlotBalance({
        currentBalance: null,
        storedType: "restock",
        storedQuantity: undefined,
        nextType: "deplete",
        nextQuantity: "10",
      }),
    ).toBe(-10)
  })
})
