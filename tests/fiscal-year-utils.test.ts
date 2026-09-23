import { describe, it, expect } from "vitest"
import {
  getCurrentFiscalYear,
  getAvailableFiscalYears,
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

describe("getAvailableFiscalYears", () => {
  it("leads with an 'All time' option covering everything", () => {
    const years = getAvailableFiscalYears()
    expect(years[0].label).toBe("All time")
    /**
     * Compared as YYYY-MM-DD strings, which is how FiscalYear stores its bounds.
     *
     * This used to call isDateInFiscalYear(), which was deleted on 2026-09-23 -- dead code with a
     * UTC/IST boundary bug. Its own tests hid the bug by only ever passing date-only strings, where
     * both sides parse to UTC midnight and the error cancels. Lexical string comparison has no
     * timezone to get wrong, so this asserts the same thing without the trap.
     */
    expect(years[0].startDate <= "2025-07-01").toBe(true)
    expect(years[0].endDate >= "2025-07-01").toBe(true)
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
