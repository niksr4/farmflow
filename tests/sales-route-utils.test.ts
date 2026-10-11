import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  canonicalizeBagType,
  canonicalizeCoffeeType,
  coerceBagsSentValue,
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

  it("applies numeric coercion and role helpers", () => {
    expect(coerceBagsSentValue(10.7, "integer")).toBe(11)
    expect(coerceBagsSentValue(10.789, "numeric")).toBe(10.79)
    expect(isScopedUserRole("user")).toBe(true)
    expect(isScopedUserRole("admin")).toBe(false)
  })

  it("recognises the abbreviations an estate actually types", () => {
    /**
     * coffeePatternFor/bagPatternFor used to live here and returned LIKE patterns -- "%cherry%" or
     * "%parchment%" -- on the assumption that every row is one or the other. Estate Mock has a
     * dispatch row and a sales row reading "Dry P", which matched NEITHER pattern, so those kilos
     * were missing from both halves of the stock slot that gates a sale.
     *
     * They are gone. app/api/sales/route.ts now builds the slot predicate from the canonical form,
     * so a slot is defined by what a value means rather than which substring it contains.
     */
    expect(canonicalizeBagType("Dry P")).toBe("Dry Parchment")
    expect(canonicalizeBagType("DP")).toBe("Dry Parchment")
    expect(canonicalizeBagType("dc")).toBe("Dry Cherry")
    // ...and still refuses what it cannot place, because this validates writes.
    expect(canonicalizeBagType("dry pepper")).toBeNull()
    expect(canonicalizeBagType("")).toBeNull()
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
