import {
  buildMonthDays,
  buildMonthlyAttendance,
  MONTH_PATTERN,
  type MonthlyAttendanceInput,
  type MonthlyAttendanceTotals,
} from "@/lib/attendance-monthly"
import { averageWorkedHours, formatHoursHm } from "@/lib/attendance-hours"

/**
 * The yearly summary: one row per worker per month, the way the estate already reads it.
 *
 * MODELLED ON THE SHEET HONEYFARM ALREADY PRINTS. SmartOffice's "Yearly Summary Report" is what
 * the office checks a year's attendance against, so this reproduces its shape — P, A, HP, WO, WOP,
 * Total Present, PayDays, a month per line — rather than inventing a layout nobody has read before.
 *
 * IT ADDS NO NEW ATTENDANCE RULES, and that is the design. Every figure comes from running
 * buildMonthlyAttendance over each month and keeping the totals. A yearly report that counted days
 * its own way would eventually disagree with the monthly grid for the same month, and the estate
 * would have two sheets and no way to tell which one is wrong. One definition of what a day is
 * worth: lib/attendance-monthly.ts.
 *
 * ── PAYDAYS ───────────────────────────────────────────────────────────────────────────────────
 *
 * PayDays = Total Present + weekly offs. Derived from the real report rather than assumed:
 *
 *   Bopaiah Jan-2026   P 26, WO 4, Total Present 26, PayDays 30      26 + 4 = 30
 *          Feb-2026    P 23, WO 4, Total Present 23, PayDays 27      23 + 4 = 27
 *          Apr-2026    P 22, WO 4, Total Present 22, PayDays 26      22 + 4 = 26
 *
 * So a Sunday is paid whether or not it is worked, which is what these estates do.
 *
 * ⚠ A WORKED SUNDAY IS COUNTED ONCE, NOT TWICE. Every sample month has WOP 0, so the original
 * report does not show its own answer for this and I am not able to copy it. Here a WOP day lands
 * in Total Present (it was worked) and is NOT also counted in the weekly-off half of PayDays — a
 * day worked on a Sunday is one day's pay, and whether it earns a premium is an estate's wage
 * policy, not something a report decides. If HoneyFarm's figures ever disagree with ours it will
 * be on exactly this row, and this is the paragraph to read first.
 *
 * ── WHAT IS DELIBERATELY ABSENT ───────────────────────────────────────────────────────────────
 *
 * NO LEAVE COLUMNS. The original carries PL, CL, SL, RHO, COFF, Other Leave and Total Leave, and
 * every one of them is 0 in every row of the sample. FarmFlow does not record leave types at all,
 * so printing those columns would fill a page with zeroes that mean "we do not track this" while
 * reading as "nobody was ever sick". That is the same class of confident wrong answer as a login
 * count printed under the heading "engagement". When leave is recorded, the columns can be real.
 */

export type YearlyAttendanceInput = MonthlyAttendanceInput & {
  /**
   * ISO date -> hours the terminal clocked that day.
   *
   * Only days with BOTH a punch in and a punch out appear. A day with one punch is missing from
   * the map rather than present as 0 — its finish was never recorded, and counting it as a
   * zero-hour day is how an average collapses. Manually-marked estates have an empty map, which
   * is why every hours figure below can be null.
   */
  hoursByDate?: Record<string, number>
}

export type YearlyMonthTotals = {
  /** YYYY-MM */
  month: string
  /** "Jan-2026" — the label the original prints. */
  label: string
  /** Full days worked. */
  present: number
  /** Half days worked. */
  halfDays: number
  /** On the roster, a working day, not marked. */
  absent: number
  /** Sundays not worked. */
  weeklyOff: number
  /** Sundays worked anyway. */
  weeklyOffWorked: number
  /** Days worked, in day-equivalents: full + half at half + any Sunday worked. */
  totalPresent: number
  /** What the month pays for: days worked plus the Sundays that are paid regardless. */
  payDays: number
  /**
   * Mean hours on the days the terminal timed. Null when it timed none — NOT 0:00, which would
   * read as "worked no hours" about an estate that simply marks attendance by hand.
   */
  averageHours: number | null
  /** The average's denominator. Shown, because an average of three days is not a month. */
  clockedDays: number
}

export type YearlyAttendanceRow = {
  serial: number
  employeeCode: string
  employeeName: string
  months: YearlyMonthTotals[]
  /** Every month added up, so the year has a bottom line per worker. */
  year: Omit<YearlyMonthTotals, "month" | "label">
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Jan-2026". */
export const formatMonthLabel = (month: string) =>
  `${MONTH_NAMES[Number(month.slice(5, 7)) - 1] || "?"}-${month.slice(0, 4)}`

/**
 * Every month from `from` to `to` inclusive, both YYYY-MM.
 *
 * Returns [] rather than throwing on a bad or inverted range — a report with no months renders an
 * empty state, which is a better answer to a mistyped date than a crash. Capped at 24 months so a
 * fat-fingered year cannot ask for four hundred months of grid.
 */
export function monthsBetween(from: string, to: string, limit = 24): string[] {
  if (!MONTH_PATTERN.test(from) || !MONTH_PATTERN.test(to)) return []
  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  const span = (ty - fy) * 12 + (tm - fm)
  if (span < 0 || span >= limit) return []

  return Array.from({ length: span + 1 }, (_, i) => {
    const total = fy * 12 + (fm - 1) + i
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
  })
}

const monthTotals = (
  month: string,
  totals: MonthlyAttendanceTotals,
  hoursThisMonth: number[],
): YearlyMonthTotals => {
  const clocked = averageWorkedHours(hoursThisMonth)
  // daysPayable is already full + half-at-half + worked Sundays. Naming it totalPresent here keeps
  // the report's own vocabulary without recomputing anything.
  const totalPresent = totals.daysPayable
  return {
    month,
    label: formatMonthLabel(month),
    present: totals.present,
    halfDays: totals.halfDays,
    absent: totals.absent,
    weeklyOff: totals.weeklyOff,
    weeklyOffWorked: totals.weeklyOffWorked,
    totalPresent,
    payDays: totalPresent + totals.weeklyOff,
    averageHours: clocked.averageHours,
    clockedDays: clocked.daysCounted,
  }
}

/**
 * The whole report.
 *
 * `today` bounds the last month so an in-progress month shows what has happened rather than
 * counting the rest of it as absence — the same rule the monthly grid uses, for the same reason.
 * Sep-2026 in the sample reads P 10, A 0 on the 11th, not P 10, A 19.
 */
export function buildYearlyAttendance(
  workers: readonly YearlyAttendanceInput[],
  months: readonly string[],
  today: string,
): YearlyAttendanceRow[] {
  const perMonth = months.map((month) => ({
    month,
    rows: buildMonthlyAttendance([...workers], buildMonthDays(month), today),
  }))

  return workers.map((worker, index) => {
    /** This worker's clocked durations, bucketed by the month the date falls in. */
    const hoursIn = (month: string) =>
      Object.entries(worker.hoursByDate ?? {})
        .filter(([iso]) => iso.startsWith(`${month}-`))
        .map(([, hours]) => Number(hours))
        .filter((hours) => Number.isFinite(hours) && hours >= 0)

    const monthRows = perMonth.map(({ month, rows }) => monthTotals(month, rows[index].totals, hoursIn(month)))

    const year = monthRows.reduce(
      (sum, m) => ({
        present: sum.present + m.present,
        halfDays: sum.halfDays + m.halfDays,
        absent: sum.absent + m.absent,
        weeklyOff: sum.weeklyOff + m.weeklyOff,
        weeklyOffWorked: sum.weeklyOffWorked + m.weeklyOffWorked,
        totalPresent: sum.totalPresent + m.totalPresent,
        payDays: sum.payDays + m.payDays,
      }),
      { present: 0, halfDays: 0, absent: 0, weeklyOff: 0, weeklyOffWorked: 0, totalPresent: 0, payDays: 0 },
    )

    /**
     * The year's average is taken over EVERY clocked day, not as the mean of the monthly means.
     *
     * Averaging averages weights a three-day month the same as a twenty-six-day one, which is the
     * same error as averaging an average price across unequal quantities — the mistake script 128
     * had to correct when merging two stock rows. One month where somebody worked two short days
     * would drag a whole year down by as much as a full month of normal ones.
     */
    const yearClocked = averageWorkedHours(
      months.flatMap((month) => hoursIn(month)),
    )

    return {
      serial: index + 1,
      employeeCode: String(worker.employeeCode ?? "").trim() || "—",
      employeeName: worker.employeeName,
      months: monthRows,
      year: { ...year, averageHours: yearClocked.averageHours, clockedDays: yearClocked.daysCounted },
    }
  })
}

/** The estate's bottom line for the whole range. */
export function summariseYearlyAttendance(rows: readonly YearlyAttendanceRow[]) {
  return {
    workers: rows.length,
    totalPresent: rows.reduce((sum, r) => sum + r.year.totalPresent, 0),
    payDays: rows.reduce((sum, r) => sum + r.year.payDays, 0),
    absent: rows.reduce((sum, r) => sum + r.year.absent, 0),
    /**
     * The estate's average day length, across every clocked day of every worker.
     *
     * Weighted by days rather than by worker, for the reason given on the per-worker year average:
     * a worker with two clocked days must not count as much as one with two hundred.
     */
    ...(() => {
      const across = averageWorkedHours(
        rows.flatMap((r) =>
          r.months.flatMap((m) =>
            m.clockedDays > 0 && m.averageHours !== null
              ? Array.from({ length: m.clockedDays }, () => m.averageHours as number)
              : [],
          ),
        ),
      )
      return { averageHours: across.averageHours, clockedDays: across.daysCounted }
    })(),
  }
}

const csvCell = (value: unknown) => {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per worker per month — the layout that opens correctly in Excel and prints. */
export function yearlyAttendanceToCsv(
  rows: readonly YearlyAttendanceRow[],
  months: readonly string[],
  estateName: string,
): string {
  const lines: string[] = [
    csvCell(estateName),
    csvCell("Yearly Summary Report"),
    csvCell(months.length ? `${formatMonthLabel(months[0])} to ${formatMonthLabel(months[months.length - 1])}` : ""),
    "",
    ["Code", "Employee", "Month", "P", "HP", "A", "WO", "WOP", "Total Present", "PayDays", "Avg hrs/day", "Days timed"].join(","),
  ]

  for (const row of rows) {
    for (const m of row.months) {
      lines.push(
        [
          csvCell(row.employeeCode),
          csvCell(row.employeeName),
          csvCell(m.label),
          m.present,
          m.halfDays,
          m.absent,
          m.weeklyOff,
          m.weeklyOffWorked,
          m.totalPresent,
          m.payDays,
          csvCell(formatHoursHm(m.averageHours)),
          m.clockedDays,
        ].join(","),
      )
    }
    lines.push(
      [
        csvCell(row.employeeCode),
        csvCell(row.employeeName),
        csvCell("TOTAL"),
        row.year.present,
        row.year.halfDays,
        row.year.absent,
        row.year.weeklyOff,
        row.year.weeklyOffWorked,
        row.year.totalPresent,
        row.year.payDays,
        csvCell(formatHoursHm(row.year.averageHours)),
        row.year.clockedDays,
      ].join(","),
    )
  }

  return lines.join("\n")
}
