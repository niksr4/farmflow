import { describe, expect, it } from "vitest"

import { allocateInventoryQuantity, normalizeExpenseInventoryItems, sameExpenseInventoryItems } from "../lib/expense-inventory"

describe("allocateInventoryQuantity", () => {
  it("uses the preferred location first when it has sufficient stock", () => {
    const allocations = allocateInventoryQuantity(
      [
        { itemType: "Diesel (L)", locationId: "loc-b", quantity: 30, unit: "L" },
        { itemType: "Diesel (L)", locationId: "loc-a", quantity: 60, unit: "L" },
        { itemType: "Diesel (L)", locationId: null, quantity: 20, unit: "L" },
      ],
      40,
      "loc-a",
    )

    expect(allocations).toEqual([
      { itemType: "Diesel (L)", locationId: "loc-a", quantity: 40, unit: "L", unitCost: 0 },
    ])
  })

  it("carries each slot's weighted-average cost onto its allocation", () => {
    const allocations = allocateInventoryQuantity(
      [
        { itemType: "Diesel (L)", locationId: "loc-a", quantity: 60, unit: "L", avgPrice: 92.5 },
      ],
      40,
      "loc-a",
    )

    expect(allocations).toEqual([
      { itemType: "Diesel (L)", locationId: "loc-a", quantity: 40, unit: "L", unitCost: 92.5 },
    ])
  })

  it("splits the depletion across available slots when one slot is not enough", () => {
    const allocations = allocateInventoryQuantity(
      [
        { itemType: "Urea Fertilizer", locationId: "loc-a", quantity: 30, unit: "kg" },
        { itemType: "Urea Fertilizer", locationId: null, quantity: 15, unit: "kg" },
        { itemType: "Urea Fertilizer", locationId: "loc-b", quantity: 20, unit: "kg" },
      ],
      50,
      "loc-a",
    )

    expect(allocations).toEqual([
      { itemType: "Urea Fertilizer", locationId: "loc-a", quantity: 30, unit: "kg", unitCost: 0 },
      { itemType: "Urea Fertilizer", locationId: null, quantity: 15, unit: "kg", unitCost: 0 },
      { itemType: "Urea Fertilizer", locationId: "loc-b", quantity: 5, unit: "kg", unitCost: 0 },
    ])
  })

  it("throws when the requested quantity exceeds total available stock", () => {
    expect(() =>
      allocateInventoryQuantity(
        [{ itemType: "Pesticide (L)", locationId: null, quantity: 12, unit: "L" }],
        18,
      ),
    ).toThrow("Insufficient stock for Pesticide (L)")
  })
})

describe("normalizeExpenseInventoryItems", () => {
  it("merges duplicate item rows by normalized item type", () => {
    expect(
      normalizeExpenseInventoryItems([
        { itemType: " Diesel  (L) ", quantity: 10 },
        { itemType: "diesel (l)", quantity: 5.125 },
        { itemType: "Urea", quantity: 2 },
      ]),
    ).toEqual([
      { itemType: "Diesel (L)", quantity: 15.125 },
      { itemType: "Urea", quantity: 2 },
    ])
  })

  it("drops blank or non-positive rows", () => {
    expect(
      normalizeExpenseInventoryItems([
        { itemType: "", quantity: 10 },
        { itemType: "Pesticide", quantity: 0 },
        { itemType: "Pesticide", quantity: -3 },
      ]),
    ).toEqual([])
  })
})

describe("sameExpenseInventoryItems", () => {
  it("treats reordered and differently-cased rows as the same inventory payload", () => {
    expect(
      sameExpenseInventoryItems(
        [
          { itemType: "Diesel (L)", quantity: 10 },
          { itemType: "Urea", quantity: 5 },
        ],
        [
          { itemType: " urea ", quantity: 5 },
          { itemType: "diesel (l)", quantity: 10 },
        ],
      ),
    ).toBe(true)
  })

  it("detects when linked inventory payloads are actually different", () => {
    expect(
      sameExpenseInventoryItems(
        [{ itemType: "Diesel (L)", quantity: 10 }],
        [{ itemType: "Diesel (L)", quantity: 12 }],
      ),
    ).toBe(false)
  })
})
