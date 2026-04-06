import { describe, expect, it } from "vitest"

import { allocateInventoryQuantity } from "../lib/expense-inventory"

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
      { itemType: "Diesel (L)", locationId: "loc-a", quantity: 40, unit: "L" },
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
      { itemType: "Urea Fertilizer", locationId: "loc-a", quantity: 30, unit: "kg" },
      { itemType: "Urea Fertilizer", locationId: null, quantity: 15, unit: "kg" },
      { itemType: "Urea Fertilizer", locationId: "loc-b", quantity: 5, unit: "kg" },
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
