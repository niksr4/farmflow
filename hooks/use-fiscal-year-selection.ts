"use client"

import { useState } from "react"
import { getAvailableFiscalYears, getCurrentFiscalYear, type FiscalYear } from "@/lib/fiscal-year-utils"

/**
 * Shared fiscal-year selection state for tabs that let the user browse a
 * specific season's data. Defaults to the current season — always pass
 * startDate/endDate explicitly to API calls rather than relying on a query
 * param being omitted, since an omitted param silently meaning "current
 * season" (or worse, "all time") was the root cause of more than one bug.
 */
export function useFiscalYearSelection() {
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const [availableFiscalYears] = useState<FiscalYear[]>(() => getAvailableFiscalYears())

  return {
    selectedFiscalYear,
    setSelectedFiscalYear,
    availableFiscalYears,
    startDate: selectedFiscalYear.startDate,
    endDate: selectedFiscalYear.endDate,
  }
}
