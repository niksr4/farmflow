import { istTodayParts } from "@/lib/date-utils"

export interface FiscalYear {
  label: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}

/**
 * Get the current fiscal year based on the ESTATE's date
 * Fiscal year runs from April 1 to March 31
 *
 * IST, not the host's calendar. This read `new Date().getMonth()` / `.getFullYear()`, so at
 * 2026-03-31T19:00:00Z — when the estate is already into 1 April and therefore FY 26/27 — a UTC
 * server or any viewer west of IST still saw March and returned **FY 25/26**. That is the default
 * financial year for the balance sheet, the P&L and the season reports, so the whole app would
 * open on the wrong year for the 5.5 hours either side of the boundary.
 */
export function getCurrentFiscalYear(): FiscalYear {
  const { year: currentYear, month: currentMonth } = istTodayParts() // month is 1-12

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

/*
 * isDateInFiscalYear was deleted on 2026-09-23. It was dead -- nothing but its own test ever
 * called it -- and it was wrong in a way that would have surfaced the moment it was adopted:
 *
 *   const checkDate = typeof date === "string" ? new Date(date) : date
 *   return checkDate >= new Date(fy.startDate) && checkDate <= new Date(fy.endDate)
 *
 * new Date("2026-03-31") is UTC midnight, so passing a Date for any real moment on 31 March --
 * say 10:00 IST, which is 04:30Z -- compares GREATER than the year's end and falls outside it.
 * Every instant on the last day of the fiscal year after 05:30 IST was excluded. Its test only
 * ever passed date-only STRINGS, where both sides parse to UTC midnight and the bug cancels out.
 *
 * If a fiscal-year membership check is wanted later, write it against YYYY-MM-DD strings and
 * compare them lexically -- FiscalYear already stores its bounds that way, and string comparison
 * has no timezone to get wrong. Do not reinstate this signature.
 */

/**
 * Get the start and end date for a fiscal year
 */
export function getFiscalYearDateRange(fiscalYear: FiscalYear): { startDate: string; endDate: string } {
  return {
    startDate: fiscalYear.startDate,
    endDate: fiscalYear.endDate,
  }
}

/**
 * Get the fiscal year immediately preceding the given one.
 */
export function getPreviousFiscalYear(fiscalYear: FiscalYear): FiscalYear {
  const startYear = Number.parseInt(fiscalYear.startDate.split("-")[0], 10) - 1
  const endYear = startYear + 1
  return {
    label: `FY ${String(startYear).slice(2)}/${String(endYear).slice(2)}`,
    startDate: `${startYear}-04-01`,
    endDate: `${endYear}-03-31`,
  }
}

function normalizeMentionedYear(raw: string): number | null {
  const year = Number.parseInt(raw, 10)
  if (Number.isNaN(year)) return null
  if (raw.length === 4) return year
  if (raw.length === 2) return year >= 50 ? 1900 + year : 2000 + year
  return null
}

// Matches "FY 25/26", "FY25-26", "2025/26", or bare "25/26" — only accepted when the
// two numbers are consecutive years, which filters out dates/fractions like "10/25".
const FISCAL_YEAR_MENTION_PATTERN = /\bFY\s*[-\s]?(\d{2,4})\s*[/-]\s*(\d{2,4})\b|\b(\d{2,4})\s*[/-]\s*(\d{2,4})\b/gi

/**
 * Look for an explicit fiscal-year mention in free text, e.g. "from 25/26 data".
 * Returns null if no consecutive-year pattern is found.
 */
export function parseFiscalYearMention(text: string): FiscalYear | null {
  if (!text) return null
  const pattern = new RegExp(FISCAL_YEAR_MENTION_PATTERN.source, "gi")
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const rawStart = match[1] ?? match[3]
    const rawEnd = match[2] ?? match[4]
    if (!rawStart || !rawEnd) continue
    const startYear = normalizeMentionedYear(rawStart)
    const endYear = normalizeMentionedYear(rawEnd)
    if (startYear == null || endYear == null || endYear !== startYear + 1) continue
    return {
      label: `FY ${String(startYear).slice(2)}/${String(endYear).slice(2)}`,
      startDate: `${startYear}-04-01`,
      endDate: `${endYear}-03-31`,
    }
  }
  return null
}

const COMPARISON_INTENT_PATTERN =
  /\b(discrepanc\w*|compar\w*|versus|vs|difference|mismatch\w*|variance|year[- ]on[- ]year|yoy)\b/i

/**
 * Whether free text implies a year-on-year comparison (e.g. "discrepancy", "vs last year").
 */
export function hasComparisonIntent(text: string): boolean {
  return COMPARISON_INTENT_PATTERN.test(text || "")
}

/**
 * Resolve which fiscal-year window(s) an assistant question is asking about.
 * A secondary window is returned whenever comparison intent is detected (or an
 * explicit past FY is named alongside comparison language), so the caller can
 * fetch both periods and let the LLM compare them directly.
 */
export function resolveFiscalYearWindows(question: string): { primary: FiscalYear; secondary: FiscalYear | null } {
  const current = getCurrentFiscalYear()
  const mentioned = parseFiscalYearMention(question)
  const comparisonIntent = hasComparisonIntent(question)

  if (mentioned && mentioned.label !== current.label) {
    return { primary: mentioned, secondary: comparisonIntent ? current : null }
  }
  if (comparisonIntent) {
    return { primary: current, secondary: getPreviousFiscalYear(current) }
  }
  return { primary: current, secondary: null }
}
