import { describe, it, expect } from "vitest"
import {
  isBlockedNumericKey,
  canAcceptNonNegative,
  toNonNegativeNumber,
  requirePositiveNumber,
} from "@/lib/number-input"

describe("isBlockedNumericKey", () => {
  it("blocks sign and exponent keys that would allow negatives/scientific input", () => {
    for (const key of ["-", "+", "e", "E"]) expect(isBlockedNumericKey(key)).toBe(true)
  })
  it("allows digits and separators", () => {
    for (const key of ["0", "9", ".", "Backspace"]) expect(isBlockedNumericKey(key)).toBe(false)
  })
})

describe("canAcceptNonNegative", () => {
  it("accepts empty (mid-typing) and non-negative numbers", () => {
    expect(canAcceptNonNegative("")).toBe(true)
    expect(canAcceptNonNegative("0")).toBe(true)
    expect(canAcceptNonNegative("12.5")).toBe(true)
  })
  it("rejects negatives and non-numeric text", () => {
    expect(canAcceptNonNegative("-1")).toBe(false)
    expect(canAcceptNonNegative("abc")).toBe(false)
  })
})

describe("toNonNegativeNumber", () => {
  it("returns the number for valid non-negative input", () => {
    expect(toNonNegativeNumber("42")).toBe(42)
    expect(toNonNegativeNumber(0)).toBe(0)
  })
  it("returns null for negatives and non-finite values", () => {
    expect(toNonNegativeNumber("-3")).toBeNull()
    expect(toNonNegativeNumber("nope")).toBeNull()
    expect(toNonNegativeNumber(Number.NaN)).toBeNull()
  })
})

describe("requirePositiveNumber", () => {
  it("is true only for strictly positive finite numbers", () => {
    expect(requirePositiveNumber("1")).toBe(true)
    expect(requirePositiveNumber(0)).toBe(false)
    expect(requirePositiveNumber("-2")).toBe(false)
    expect(requirePositiveNumber("x")).toBe(false)
  })
})
