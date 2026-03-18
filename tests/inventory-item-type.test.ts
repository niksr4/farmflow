import { describe, expect, it } from "vitest"

import { normalizeInventoryItemType } from "../lib/inventory-item-type"

describe("inventory item type normalization", () => {
  it("trims surrounding whitespace and collapses repeated gaps", () => {
    expect(normalizeInventoryItemType("  Single   super   phosphate  ")).toBe("Single super phosphate")
  })

  it("keeps legacy labels comparable without changing caller casing", () => {
    expect(normalizeInventoryItemType("Single super phosphate ")).toBe(normalizeInventoryItemType("Single super phosphate"))
  })

  it("returns an empty string for nullish input", () => {
    expect(normalizeInventoryItemType(undefined)).toBe("")
    expect(normalizeInventoryItemType(null)).toBe("")
  })
})
