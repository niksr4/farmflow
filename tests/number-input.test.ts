import { describe, expect, it } from "vitest"
import {
  canAcceptNonNegative,
  isBlockedNumericKey,
  numericInputValue,
  requirePositiveNumber,
  toNonNegativeNumber,
} from "@/lib/number-input"

describe("numericInputValue", () => {
  it("renders a zero as blank so the field starts empty and can be cleared", () => {
    // The reported bug: the box lands on "0", and backspacing puts it straight back because
    // Number.parseFloat("") || 0 is 0. Blanking 0 fixes both the initial state and the delete.
    expect(numericInputValue(0)).toBe("")
  })

  it("renders real values unchanged", () => {
    expect(numericInputValue(5)).toBe("5")
    expect(numericInputValue(12.5)).toBe("12.5")
    expect(numericInputValue(-3)).toBe("-3")
  })

  it("treats null, undefined and empty string as blank", () => {
    expect(numericInputValue(null)).toBe("")
    expect(numericInputValue(undefined)).toBe("")
    expect(numericInputValue("")).toBe("")
  })

  it("blanks NaN rather than rendering the text 'NaN' in the box", () => {
    expect(numericInputValue(Number.NaN)).toBe("")
    expect(numericInputValue(Number.POSITIVE_INFINITY)).toBe("")
  })

  it("treats a string zero as blank too, since it renders identically", () => {
    expect(numericInputValue("0")).toBe("")
    expect(numericInputValue("0.00")).toBe("")
  })

  it("preserves a partially typed decimal", () => {
    expect(numericInputValue("0.5")).toBe("0.5")
  })
})

describe("existing number-input helpers still behave", () => {
  it("blocks sign and exponent keys", () => {
    for (const k of ["-", "e", "E", "+"]) expect(isBlockedNumericKey(k)).toBe(true)
    expect(isBlockedNumericKey("5")).toBe(false)
  })

  it("accepts an empty box and non-negative numbers", () => {
    expect(canAcceptNonNegative("")).toBe(true)
    expect(canAcceptNonNegative("10")).toBe(true)
    expect(canAcceptNonNegative("-1")).toBe(false)
  })

  it("rejects negatives and junk when coercing", () => {
    expect(toNonNegativeNumber("10")).toBe(10)
    expect(toNonNegativeNumber("-1")).toBeNull()
    expect(toNonNegativeNumber("abc")).toBeNull()
  })

  it("requires strictly positive", () => {
    expect(requirePositiveNumber(1)).toBe(true)
    expect(requirePositiveNumber(0)).toBe(false)
  })
})
