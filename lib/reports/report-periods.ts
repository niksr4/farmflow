import { istTodayParts, todayIso } from "@/lib/date-utils"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"

/**
 * THE PERIODS THE "REPORT" MENU OFFERS, DERIVED ON THE ESTATE'S CALENDAR.
 *
 * ⚠ EVERY ONE OF THESE IS A TRAP IF IT TOUCHES A HOST-LOCAL DATE, and the traps are not subtle:
 * `new Date().getMonth()` on a UTC server at 19:00 IST on the 1st of a month returns LAST month,
 * so "This month" would report the wrong month entirely for the 5.5 hours either side of every
 * month boundary. That is signatures 3 and 4 of the seven in
 * tests/today-is-the-estates-today.test.ts, and it has already shipped twice in this codebase --
 * once in the coffee-season range and once in the fiscal-year default.
 *
 * So nothing here constructs a Date to read parts off. Everything is built from
 * `istTodayParts()` / `todayIso()` as YYYY-MM-DD strings, and the only arithmetic that needs a
 * Date (finding Monday) anchors it at UTC midnight so no offset can enter.
 *
 * ⚠ AND EVERY PERIOD ENDS TODAY, NOT AT THE END OF THE CALENDAR UNIT. A report whose range runs
 * to 31 October when today is the 22nd claims nine days nobody has recorded, and prints them as
 * zero. "This month" means the month so far.
 */

export type ReportPeriodId = "day" | "week" | "month" | "year" | "current"

export type ReportPeriod = {
  id: ReportPeriodId
  /** What the menu shows, and what lands in the report's subtitle. */
  label: string
  /** Inclusive YYYY-MM-DD bounds. Both are `null` for `current`, which means "whatever the tab is showing". */
  start: string | null
  end: string | null
}

const pad = (value: number) => String(value).padStart(2, "0")

/**
 * The Monday of the estate's current week, as YYYY-MM-DD.
 *
 * Anchored at `T00:00:00Z` so the subtraction happens in UTC and cannot be shifted by the host's
 * offset -- the same pattern lib/payroll-period.ts and the season range use. `getUTCDay`, not
 * `getDay`: the latter would read the host's weekday off a UTC-anchored instant, which is the
 * variable form of the same bug.
 */
export const estateWeekStart = (today: string = todayIso()): string => {
  const anchored = new Date(`${today}T00:00:00Z`)
  // getUTCDay: 0 = Sunday. Shift so Monday is the first day of the week, which is how an estate
  // muster week runs.
  const daysSinceMonday = (anchored.getUTCDay() + 6) % 7
  return new Date(anchored.getTime() - daysSinceMonday * 86_400_000).toISOString().slice(0, 10)
}

/** The first of the estate's current month, as YYYY-MM-DD. */
export const estateMonthStart = (): string => {
  const { year, month } = istTodayParts() // month is 1-12
  return `${year}-${pad(month)}-01`
}

/**
 * Build the selectable periods.
 *
 * `current` is first and is the default, because the tab's own filter is what the person was
 * already looking at -- offering a report that silently covers a different range than the screen
 * is how a reader ends up comparing two documents that disagree.
 */
export const buildReportPeriods = (options: { currentLabel?: string } = {}): ReportPeriod[] => {
  const today = todayIso()
  const fiscalYear = getCurrentFiscalYear()

  return [
    {
      id: "current",
      label: options.currentLabel || "As shown on screen",
      start: null,
      end: null,
    },
    { id: "day", label: `Today (${today})`, start: today, end: today },
    { id: "week", label: "This week so far", start: estateWeekStart(today), end: today },
    { id: "month", label: "This month so far", start: estateMonthStart(), end: today },
    {
      // The Indian financial year, 1 April to 31 March, reusing the one definition the balance
      // sheet and P&L already share rather than minting a second opinion about when a year starts.
      id: "year",
      label: `${fiscalYear.label} so far`,
      start: fiscalYear.startDate,
      end: today,
    },
  ]
}

/** The subtitle a report carries for a period. Never blank: a report without a period is unauditable. */
export const describeReportPeriod = (period: ReportPeriod, fallback: string) =>
  period.id === "current" ? fallback : `${period.start} to ${period.end}`
