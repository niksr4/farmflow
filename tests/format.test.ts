import { describe, it, expect } from "vitest"
import { formatNumber, formatCurrency } from "@/lib/format"

describe("formatNumber", () => {
  it("uses Indian digit grouping (lakh/crore style)", () => {
    expect(formatNumber(1234567, 0)).toBe("12,34,567")
    expect(formatNumber(1000, 0)).toBe("1,000")
  })

  it("drops the fractional part only when every decimal is zero", () => {
    expect(formatNumber(1000)).toBe("1,000")
    // A single non-zero decimal keeps the full 2-digit fraction ("...50", not "...5")
    expect(formatNumber(1000.5)).toBe("1,000.50")
  })

  it("keeps meaningful decimals", () => {
    expect(formatNumber(12.34)).toBe("12.34")
  })

  it("respects a custom digit count and rounds", () => {
    expect(formatNumber(12.3456, 3)).toBe("12.346")
  })

  it("coerces non-finite values to zero", () => {
    expect(formatNumber(Number.NaN)).toBe("0")
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("0")
  })
})

describe("formatCurrency", () => {
  it("prefixes the rupee sign", () => {
    expect(formatCurrency(1500)).toBe("₹1,500")
    expect(formatCurrency(1500.75)).toBe("₹1,500.75")
  })

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("₹0")
  })
})

describe("formatCurrency / formatNumber — negative values (NIK-21)", () => {
  // Characterization tests for a known display bug (Linear NIK-21), not the desired behavior.
  // formatCurrency places the ₹ sign before the minus instead of after it, and formatNumber
  // can render a lone "-0" for very small negative inputs that round to zero. Update these
  // once NIK-21 is fixed to assert the corrected output ("-₹1,500", "0", etc).

  it("currently glues the rupee sign in front of the minus sign (bug, tracked as NIK-21)", () => {
    expect(formatCurrency(-1500)).toBe("₹-1,500")
    expect(formatCurrency(-1500.5)).toBe("₹-1,500.50")
  })

  it("currently renders a very small negative value as \"-0\" instead of \"0\" (bug, tracked as NIK-21)", () => {
    expect(formatNumber(-0.001)).toBe("-0")
  })
})
