import { describe, expect, it } from "vitest"

import {
  buildSparkPath,
  formatCurrency,
  formatCurrencyWithDecimals,
  formatKgAndBags,
  formatNumber,
  formatPercent,
  formatSignedCurrencyWithDecimals,
  getAlertTone,
} from "@/components/season-dashboard/format"

describe("formatNumber", () => {
  it("groups in the Indian system — lakhs and crores, not thousands", () => {
    // 12,34,567.89 and not 1,234,567.89. An estate manager reading "1,234,567" has to count
    // digits to find the lakh.
    expect(formatNumber(1234567.891)).toBe("12,34,567.89")
  })

  it("renders a missing or unusable figure as 0 rather than NaN", () => {
    expect(formatNumber(Number.NaN)).toBe("0")
    expect(formatNumber(undefined as unknown as number)).toBe("0")
    expect(formatNumber(null as unknown as number)).toBe("0")
  })

  it("honours the requested precision", () => {
    expect(formatNumber(3.14159, 0)).toBe("3")
    expect(formatNumber(3.14159, 3)).toBe("3.142")
  })
})

describe("formatCurrency", () => {
  it("shows whole rupees with the symbol", () => {
    expect(formatCurrency(2841323)).toBe("₹28,41,323")
  })

  it("survives NaN", () => {
    expect(formatCurrency(Number.NaN)).toBe("₹0")
  })
})

describe("formatCurrencyWithDecimals", () => {
  it("pads to exactly the requested decimals, so a column of figures lines up", () => {
    expect(formatCurrencyWithDecimals(1234.5)).toBe("₹1,234.50")
    expect(formatCurrencyWithDecimals(1234)).toBe("₹1,234.00")
  })
})

describe("formatSignedCurrencyWithDecimals", () => {
  it("marks the direction of a variance explicitly", () => {
    expect(formatSignedCurrencyWithDecimals(100)).toBe("+₹100.00")
    expect(formatSignedCurrencyWithDecimals(-100)).toBe("-₹100.00")
  })

  it("leaves zero unsigned — '+₹0.00' reads as a gain that did not happen", () => {
    expect(formatSignedCurrencyWithDecimals(0)).toBe("₹0.00")
  })

  it("puts the sign outside the currency symbol, not inside it", () => {
    // The sign is prefixed to the formatted absolute value, so a negative reads "-₹100.00"
    // rather than Intl's own "-₹100.00" vs "₹-100.00" ambiguity.
    expect(formatSignedCurrencyWithDecimals(-100).startsWith("-₹")).toBe(true)
  })
})

describe("formatPercent", () => {
  it("scales a fraction to a percentage", () => {
    expect(formatPercent(0.1234)).toBe("12.3%")
    expect(formatPercent(1)).toBe("100%")
  })
})

describe("formatKgAndBags", () => {
  it("converts kgs to bags at the tenant's bag weight", () => {
    expect(formatKgAndBags(1000, 50)).toBe("1,000 KGs · 20 bags")
    expect(formatKgAndBags(1000, 40)).toBe("1,000 KGs · 25 bags")
  })

  it("falls back to 50 kg rather than dividing by zero", () => {
    // A tenant whose bag weight is unset or nonsensical would otherwise get Infinity bags.
    expect(formatKgAndBags(1000, 0)).toBe("1,000 KGs · 20 bags")
    expect(formatKgAndBags(1000, -5)).toBe("1,000 KGs · 20 bags")
  })
})

describe("getAlertTone", () => {
  it("only escalates high severity", () => {
    expect(getAlertTone("high")).toBe("destructive")
    expect(getAlertTone("medium")).toBe("default")
    expect(getAlertTone("low")).toBe("default")
  })
})

describe("buildSparkPath", () => {
  it("returns an empty path for no data rather than a malformed one", () => {
    expect(buildSparkPath([])).toBe("")
  })

  it("starts with a moveto and uses linetos thereafter", () => {
    const path = buildSparkPath([1, 2, 3])
    expect(path.startsWith("M")).toBe(true)
    expect(path.split("L")).toHaveLength(3)
  })

  it("spans the full width, left edge to right edge", () => {
    const path = buildSparkPath([1, 2, 3], 120, 32)
    expect(path).toContain("M0.0")
    expect(path).toContain("L120.0")
  })

  it("draws a flat line at the bottom when every value is equal, instead of dividing by zero", () => {
    // range = max - min = 0. Without the `|| 1` guard every y is NaN and the path renders nothing.
    const path = buildSparkPath([5, 5, 5], 120, 32)
    expect(path).not.toContain("NaN")
    expect(path).toBe("M0.0,32.0 L60.0,32.0 L120.0,32.0")
  })

  it("treats non-finite values as zero rather than poisoning the whole path", () => {
    const path = buildSparkPath([1, Number.NaN, 3])
    expect(path).not.toContain("NaN")
  })

  it("puts the highest value at the top of the box", () => {
    // y is inverted: SVG y grows downward, so the max must land at y=0.
    const path = buildSparkPath([0, 10], 120, 32)
    expect(path).toBe("M0.0,32.0 L120.0,0.0")
  })

  it("handles a single point without dividing by zero on the x axis", () => {
    expect(buildSparkPath([7], 120, 32)).toBe("M0.0,32.0")
  })
})
