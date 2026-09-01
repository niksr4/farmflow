import { describe, it, expect } from "vitest"
import { formatNumber, formatCurrency, formatUnitPrice } from "@/lib/format"

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

  it("does not sign a value that rounds away to nothing", () => {
    // Was "-0". Harmless while money carried two decimals and only sub-paise inputs could hit it;
    // now that money rounds to the rupee, EVERY balance between -₹0.50 and zero lands here.
    expect(formatNumber(-0.001)).toBe("0")
    expect(formatNumber(-0.3, 0)).toBe("0")
  })
})

describe("formatCurrency — money rounds to the rupee", () => {
  it("prefixes the rupee sign", () => {
    expect(formatCurrency(1500)).toBe("₹1,500")
  })

  it("rounds rather than showing paise", () => {
    // The wage bill that prompted this: ₹16,96,148.50 across a payroll column.
    expect(formatCurrency(1696148.5)).toBe("₹16,96,149")
    expect(formatCurrency(1500.75)).toBe("₹1,501")
    expect(formatCurrency(1500.4)).toBe("₹1,500")
  })

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("₹0")
    expect(formatCurrency(-0.3)).toBe("₹0")
  })

  it("still takes an explicit digit count, for tax invoices", () => {
    // billing-tab renders subtotal/CGST/SGST/total at 2 so the parts keep summing to the whole.
    expect(formatCurrency(1500.75, 2)).toBe("₹1,500.75")
  })
})

describe("formatUnitPrice — per-unit prices keep their paise", () => {
  it("keeps the decimals that distinguish one rate from another", () => {
    // Rounded, these two fertiliser rates are the same number. They are not the same purchase.
    expect(formatUnitPrice(66)).toBe("₹66")
    expect(formatUnitPrice(66.49)).toBe("₹66.49")
  })

  it("keeps the half-rupee that exposed the calcium nitrate mispricing", () => {
    // A blended ₹1,828.50/kg reads as an anomaly; ₹1,829 reads as an ordinary rate.
    expect(formatUnitPrice(1828.5)).toBe("₹1,828.50")
  })

  it("is a different answer from formatCurrency, which is the whole point", () => {
    expect(formatUnitPrice(1828.5)).not.toBe(formatCurrency(1828.5))
  })
})

describe("formatCurrency — negative values (NIK-21)", () => {
  // Characterization test for the remaining half of NIK-21: the ₹ sign still sits before the minus.
  // The "-0" half is fixed above. Update these once the sign placement is corrected ("-₹1,500").
  it("currently glues the rupee sign in front of the minus sign (bug, tracked as NIK-21)", () => {
    expect(formatCurrency(-1500)).toBe("₹-1,500")
    expect(formatUnitPrice(-1500.5)).toBe("₹-1,500.50")
  })
})
