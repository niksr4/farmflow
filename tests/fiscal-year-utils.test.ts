import { describe, it, expect } from "vitest"
import {
  getCurrentFiscalYear,
  getAvailableFiscalYears,
  isDateInFiscalYear,
  getFiscalYearDateRange,
  type FiscalYear,
} from "@/lib/fiscal-year-utils"

const FY: FiscalYear = { label: "FY 25/26", startDate: "2025-04-01", endDate: "2026-03-31" }

describe("getCurrentFiscalYear", () => {
  it("returns an April–March window with matching label", () => {
    const fy = getCurrentFiscalYear()
    expect(fy.startDate).toMatch(/-04-01$/)
    expect(fy.endDate).toMatch(/-03-31$/)
    const startYear = Number(fy.startDate.slice(0, 4))
    expect(fy.endDate.slice(0, 4)).toBe(String(startYear + 1))
    expect(fy.label).toBe(`FY ${String(startYear).slice(2)}/${String(startYear + 1).slice(2)}`)
  })
})

describe("isDateInFiscalYear", () => {
  it("includes the boundary dates", () => {
    expect(isDateInFiscalYear("2025-04-01", FY)).toBe(true)
    expect(isDateInFiscalYear("2026-03-31", FY)).toBe(true)
  })
  it("includes a mid-year date and excludes outside dates", () => {
    expect(isDateInFiscalYear("2025-12-15", FY)).toBe(true)
    expect(isDateInFiscalYear("2025-03-31", FY)).toBe(false)
    expect(isDateInFiscalYear("2026-04-01", FY)).toBe(false)
  })
  it("accepts Date objects too", () => {
    expect(isDateInFiscalYear(new Date("2025-06-01"), FY)).toBe(true)
  })
})

describe("getAvailableFiscalYears", () => {
  it("leads with an 'All time' option covering everything", () => {
    const years = getAvailableFiscalYears()
    expect(years[0].label).toBe("All time")
    expect(isDateInFiscalYear("2025-07-01", years[0])).toBe(true)
  })
  it("lists real fiscal years in descending order after 'All time'", () => {
    const years = getAvailableFiscalYears()
    const real = years.slice(1)
    expect(real.length).toBeGreaterThanOrEqual(6)
    for (let i = 1; i < real.length; i++) {
      expect(real[i - 1].startDate > real[i].startDate).toBe(true)
    }
  })
})

describe("getFiscalYearDateRange", () => {
  it("returns the fiscal year's own start/end", () => {
    expect(getFiscalYearDateRange(FY)).toEqual({ startDate: "2025-04-01", endDate: "2026-03-31" })
  })
})
