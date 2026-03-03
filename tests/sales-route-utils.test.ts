import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  bagPatternFor,
  canonicalizeBagType,
  canonicalizeCoffeeType,
  coerceBagsSentValue,
  coffeePatternFor,
  getZodErrorMessage,
  isScopedUserRole,
  resolveKgsSold,
  resolvePricePerKg,
} from "../lib/server/sales-route-utils"

describe("sales route utils", () => {
  it("canonicalizes coffee and bag types", () => {
    expect(canonicalizeCoffeeType("arabica washed")).toBe("Arabica")
    expect(canonicalizeCoffeeType("robusta naturals")).toBe("Robusta")
    expect(canonicalizeCoffeeType("excelsa")).toBeNull()

    expect(canonicalizeBagType("dry cherry lot")).toBe("Dry Cherry")
    expect(canonicalizeBagType("dry parchment")).toBe("Dry Parchment")
    expect(canonicalizeBagType("green bean")).toBeNull()
  })

  it("computes kgs and prices deterministically", () => {
    expect(resolveKgsSold(2.5, 50)).toBe(125)
    expect(resolveKgsSold(2.5, 50, 117.345)).toBe(Number((117.345).toFixed(2)))
    expect(resolvePricePerKg(10000, 125)).toBe(80)
    expect(resolvePricePerKg(100, 0)).toBe(0)
  })

  it("applies numeric coercion and role/pattern helpers", () => {
    expect(coerceBagsSentValue(10.7, "integer")).toBe(11)
    expect(coerceBagsSentValue(10.789, "numeric")).toBe(10.79)
    expect(isScopedUserRole("user")).toBe(true)
    expect(isScopedUserRole("admin")).toBe(false)
    expect(coffeePatternFor("Arabica")).toBe("%arabica%")
    expect(bagPatternFor("Dry Cherry")).toBe("%cherry%")
  })

  it("extracts user-friendly zod messages", () => {
    const parseResult = z.object({ bags_sold: z.number().positive() }).safeParse({ bags_sold: -1 })
    expect(parseResult.success).toBe(false)
    if (parseResult.success) {
      throw new Error("Expected schema parse to fail")
    }
    expect(getZodErrorMessage(parseResult.error)).toBeTruthy()
    expect(getZodErrorMessage(new Error("x"))).toBeNull()
  })
})
