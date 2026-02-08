export interface FiscalYear {
  label: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}

/**
 * Get the current fiscal year based on today's date
 * Fiscal year runs from April 1 to March 31
 */
export function getCurrentFiscalYear(): FiscalYear {
  const today = new Date()
  const currentMonth = today.getMonth() + 1 // 1-12
  const currentYear = today.getFullYear()

  // If we're in Jan-Mar, we're in the previous year's fiscal year
  // If we're in Apr-Dec, we're in the current year's fiscal year
  const fiscalYearStart = currentMonth >= 4 ? currentYear : currentYear - 1
  const fiscalYearEnd = fiscalYearStart + 1

  return {
    label: `FY ${fiscalYearStart.toString().slice(2)}/${fiscalYearEnd.toString().slice(2)}`,
    startDate: `${fiscalYearStart}-04-01`,
    endDate: `${fiscalYearEnd}-03-31`,
  }
}

/**
 * Get all available fiscal years starting from 2025-26
 */
export function getAvailableFiscalYears(): FiscalYear[] {
  const fiscalYears: FiscalYear[] = []
  const currentFY = getCurrentFiscalYear()
  const currentFYStart = Number.parseInt(currentFY.startDate.split("-")[0])
  const lookbackYears = 6
  const startYear = currentFYStart - lookbackYears

  for (let year = startYear; year <= currentFYStart; year++) {
    const nextYear = year + 1
    fiscalYears.push({
      label: `FY ${year.toString().slice(2)}/${nextYear.toString().slice(2)}`,
      startDate: `${year}-04-01`,
      endDate: `${nextYear}-03-31`,
    })
  }

  return [
    { label: "All time", startDate: "1900-01-01", endDate: "2100-12-31" },
    ...fiscalYears.reverse(),
  ]
}

/**
 * Check if a date falls within a fiscal year
 */
export function isDateInFiscalYear(date: string | Date, fiscalYear: FiscalYear): boolean {
  const checkDate = typeof date === "string" ? new Date(date) : date
  const startDate = new Date(fiscalYear.startDate)
  const endDate = new Date(fiscalYear.endDate)

  return checkDate >= startDate && checkDate <= endDate
}

/**
 * Get the start and end date for a fiscal year
 */
export function getFiscalYearDateRange(fiscalYear: FiscalYear): { startDate: string; endDate: string } {
  return {
    startDate: fiscalYear.startDate,
    endDate: fiscalYear.endDate,
  }
}
