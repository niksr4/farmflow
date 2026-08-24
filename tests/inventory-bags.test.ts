import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { kgFromBags } from "@/lib/inventory-units"

/**
 * Bags are how an invoice reads and how a shed looks. They are not a unit: a bag of urea is 45 kg,
 * a bag of MOP or DAP is 50, and "73.5 bags" means a different weight for each. So bags are an
 * *input* that converts to kilos, and the sack size is remembered per item rather than guessed.
 *
 * The alternative was arithmetic in someone's head, which is the same thing removed earlier when
 * stock started being priced by invoice total instead of per-unit rate.
 */
describe("bags convert to kilos", () => {
  it("multiplies", () => {
    expect(kgFromBags(20, 45)).toBe(900)
  })

  it("handles a part bag, because estates record half sacks", () => {
    // Seshagiri hold 17.5 bags of SSP and 73.5 of urea.
    expect(kgFromBags(17.5, 50)).toBe(875)
  })

  it("gives nothing when either half is missing", () => {
    // A half-filled helper must contribute nothing rather than write a zero over a real quantity.
    expect(kgFromBags(20, "")).toBeNull()
    expect(kgFromBags("", 45)).toBeNull()
    expect(kgFromBags(0, 45)).toBeNull()
    expect(kgFromBags(20, 0)).toBeNull()
  })

  it("refuses junk rather than coercing it", () => {
    expect(kgFromBags("abc", 45)).toBeNull()
    expect(kgFromBags(20, Number.NaN)).toBeNull()
    expect(kgFromBags(-5, 45)).toBeNull()
  })
})

describe("bags never become a unit", () => {
  const units = readFileSync("lib/inventory-units.ts", "utf8")
  const shell = readFileSync("components/inventory-system.tsx", "utf8")
  const route = readFileSync("app/api/inventory-neon/route.ts", "utf8")
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

  it("the unit list still holds only what can be measured", () => {
    expect(strip(units)).toContain('export const INVENTORY_UNITS = ["kg", "L"] as const')
  })

  it("the computed kilos are what gets submitted", () => {
    // Bags win when filled: someone who typed "20 x 45" meant 900 kg and would not also have
    // typed a quantity. Falling back the other way would ignore what they entered.
    expect(strip(shell)).toContain("const quantityValue = fromBags ?? Number(newItemForm.quantity || 0)")
  })

  it("the sack size is remembered, not the bag count", () => {
    expect(strip(shell)).toContain("kg_per_bag: fromBags != null ? Number(newItemForm.kgPerBag) : undefined,")
    expect(strip(route)).toContain("SET kg_per_bag = ${kgPerBagValue}")
  })

  it("a zero or negative sack size is not stored", () => {
    expect(strip(route)).toContain("Number.isFinite(rawKgPerBag) && rawKgPerBag > 0 ? rawKgPerBag : null")
  })
})
