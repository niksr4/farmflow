/**
 * Monthly attendance grid — one row per worker, one column per day, the way the estate office
 * already reads it.
 *
 * The layout follows HoneyFarm's SmartOffice365 "Monthly Basic Attendance Report", the sheet the
 * office has been working from for years: No | Code | Emp Name | 31 day columns | totals. Matching
 * it matters more than improving on it, because a payroll clerk checks this against a wage sheet
 * line by line, and a familiar grid is checkable at a glance where a new one is not.
 *
 * WHAT IS DELIBERATELY DIFFERENT, and why:
 *
 * - **LOP, CL, PL, SL, COFF, H are not here.** They are zero on every row of the sample, because
 *   FarmFlow does not record leave at all. Printing a 0 under "Casual Leave" is not a blank, it is
 *   a claim that no casual leave was taken — and the estate may well have granted some and
 *   recorded it on paper. A number that means "we do not know" is the same mistake as a timestamp
 *   that means "we do not know". Add leave tracking first; then these columns can tell the truth.
 *
 * - **"-" for days a worker was not yet on the roster.** SmartOffice prints A. FarmFlow knows when
 *   each worker was added, and marking someone absent for a fortnight before they existed is a
 *   confident wrong answer of exactly the kind this codebase keeps producing. HoneyFarm and
 *   Seshagiri both started marking attendance on 24 August; without this rule their August sheet
 *   opens with 23 absences per worker and reads as a collapsed workforce. Same for days that have
 *   not happened yet.
 *
 * - **A Sunday somebody worked is not a day off.** SmartOffice carries a fixed weekly-off
 *   calendar, so its WO column is a setting. FarmFlow has no such calendar and derives the day
 *   off from the week, which means the derivation has to yield to evidence: if the roll says a
 *   worker was marked on a Sunday, the cell says so and the day lands in WOP — the column the
 *   original format already provides for exactly this. Medappa have 8 such Sundays.
 */

/** Sunday. Every live estate treats it as the day off; Medappa occasionally work it anyway. */
export const WEEKLY_OFF_DOW = 0

/** Below this, a day counts as half. Muster allocations only ever carry 1.0 or 0.5 today. */
export const HALF_DAY_MAX = 0.5

export type MonthlyMark =
  /** Full day worked. */
  | "P"
  /** Half day worked. */
  | "HP"
  /** On the roster, working day, not marked. */
  | "A"
  /** Weekly off, not worked. */
  | "WO"
  /** Weekly off, worked anyway. */
  | "WOP"
  /** Not on the roster yet, or the day has not happened. Not an absence. */
  | "-"

export type MonthlyAttendanceInput = {
  employeeCode: string | null
  employeeName: string
  /**
   * ISO date -> day fraction credited that day (1 for a full day, 0.5 for half). Absent days are
   * simply missing from the map rather than present with a 0, so "marked present with no
   * allocation yet" and "not marked" stay distinguishable at the caller.
   */
  creditedByDate: Record<string, number>
  /** ISO date this worker joined the roster. Days before it are blank, not absences. */
  onRosterFrom: string | null
}

export type MonthlyAttendanceTotals = {
  present: number
  halfDays: number
  absent: number
  weeklyOff: number
  weeklyOffWorked: number
  notOnRoster: number
  /** What payroll pays for: full days, half days at half, and any weekly off actually worked. */
  daysPayable: number
}

export type MonthlyAttendanceRow = {
  serial: number
  employeeCode: string
  employeeName: string
  /** One mark per day of the month, in order. */
  marks: MonthlyMark[]
  totals: MonthlyAttendanceTotals
}

export type MonthlyDay = {
  /** YYYY-MM-DD */
  iso: string
  dayOfMonth: number
  /** "Sat", "Sun", … — the second header row in the original. */
  weekday: string
  isWeeklyOff: boolean
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * The days of a month, built from the YYYY-MM string alone.
 *
 * Everything goes through UTC accessors on purpose. A calendar month is not a moment in time, and
 * running the same report from a machine in another timezone must not shift which day is a Sunday
 * — the same off-by-one that made every history row read 5:30 AM, in the other direction.
 */
export function buildMonthDays(month: string): MonthlyDay[] {
  if (!MONTH_PATTERN.test(month)) return []
  const [year, monthNumber] = month.split("-").map(Number)
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()

  return Array.from({ length: dayCount }, (_, index) => {
    const dayOfMonth = index + 1
    const date = new Date(Date.UTC(year, monthNumber - 1, dayOfMonth))
    const dow = date.getUTCDay()
    return {
      iso: `${month}-${String(dayOfMonth).padStart(2, "0")}`,
      dayOfMonth,
      weekday: WEEKDAY_NAMES[dow],
      isWeeklyOff: dow === WEEKLY_OFF_DOW,
    }
  })
}

/** "01-Aug" — the first header row in the original report. */
export const formatDayHeader = (day: MonthlyDay) => {
  const monthIndex = Number(day.iso.slice(5, 7)) - 1
  return `${String(day.dayOfMonth).padStart(2, "0")}-${MONTH_NAMES[monthIndex] || ""}`
}

/** "01-Aug-2026 to 31-Aug-2026" — the report's own subtitle. */
export const formatMonthRange = (days: MonthlyDay[]) => {
  if (days.length === 0) return ""
  const year = days[0].iso.slice(0, 4)
  return `${formatDayHeader(days[0])}-${year} to ${formatDayHeader(days[days.length - 1])}-${year}`
}

const markFor = (
  day: MonthlyDay,
  credited: number | undefined,
  onRosterFrom: string | null,
  today: string,
): MonthlyMark => {
  // Not an absence: nobody can fail to turn up before they were hired or after today.
  if (day.iso > today) return "-"
  if (onRosterFrom && day.iso < onRosterFrom) return "-"

  const worked = Number(credited) || 0
  if (worked > 0) {
    if (day.isWeeklyOff) return "WOP"
    return worked <= HALF_DAY_MAX ? "HP" : "P"
  }

  // A day off is a day off whatever the time.
  if (day.isWeeklyOff) return "WO"

  // Today is not over. Before the writer takes the roll -- which on these estates is mid-morning,
  // and later than that when the manager is out on the blocks -- every unmarked worker would
  // otherwise read as absent, and the month-to-date absence count would be wrong all morning and
  // right by evening. An unfinished day is unknown, not an absence.
  if (day.iso === today) return "-"

  return "A"
}

const emptyTotals = (): MonthlyAttendanceTotals => ({
  present: 0,
  halfDays: 0,
  absent: 0,
  weeklyOff: 0,
  weeklyOffWorked: 0,
  notOnRoster: 0,
  daysPayable: 0,
})

export function buildMonthlyAttendance(
  workers: MonthlyAttendanceInput[],
  days: MonthlyDay[],
  today: string,
): MonthlyAttendanceRow[] {
  return workers.map((worker, index) => {
    const totals = emptyTotals()
    const marks = days.map((day) => {
      const mark = markFor(day, worker.creditedByDate[day.iso], worker.onRosterFrom, today)
      if (mark === "P") {
        totals.present += 1
        totals.daysPayable += 1
      } else if (mark === "HP") {
        totals.halfDays += 1
        totals.daysPayable += 0.5
      } else if (mark === "A") {
        totals.absent += 1
      } else if (mark === "WO") {
        totals.weeklyOff += 1
      } else if (mark === "WOP") {
        totals.weeklyOffWorked += 1
        // A worked day off is paid like any other worked day. Whether it earns a premium is an
        // estate's own wage policy and is not something this report should decide.
        totals.daysPayable += Number(worker.creditedByDate[day.iso]) || 1
      } else {
        totals.notOnRoster += 1
      }
      return mark
    })

    return {
      serial: index + 1,
      employeeCode: String(worker.employeeCode ?? "").trim() || "—",
      employeeName: worker.employeeName,
      marks,
      totals,
    }
  })
}

export type MonthlyAttendanceSummary = {
  workers: number
  daysInMonth: number
  totalPayableDays: number
  /** Workers with no mark at all this month — on the roster, never turned up. */
  neverPresent: number
}

export function summariseMonthlyAttendance(
  rows: MonthlyAttendanceRow[],
  days: MonthlyDay[],
): MonthlyAttendanceSummary {
  return {
    workers: rows.length,
    daysInMonth: days.length,
    totalPayableDays: rows.reduce((sum, row) => sum + row.totals.daysPayable, 0),
    neverPresent: rows.filter((row) => row.totals.daysPayable === 0).length,
  }
}

/**
 * CSV in the original's column order, so it drops into the same spreadsheet the office already
 * has. The two header rows are kept: the office reads the weekday, not just the date.
 */
export function monthlyAttendanceToCsv(
  rows: MonthlyAttendanceRow[],
  days: MonthlyDay[],
  estateName: string,
): string {
  const escape = (value: string | number) =>
    /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value)

  const lead = ["No", "Code", "Emp Name"]
  const tail = ["P", "HP", "A", "WO", "WOP", "Payable days"]

  return [
    [escape(estateName)].join(","),
    "Monthly Basic Attendance Report",
    escape(formatMonthRange(days)),
    "",
    ["", "", "", ...days.map((d) => escape(formatDayHeader(d))), ...tail.map(() => "")].join(","),
    [...lead, ...days.map((d) => escape(`${d.dayOfMonth}-${d.weekday}`)), ...tail].join(","),
    ...rows.map((row) =>
      [
        row.serial,
        escape(row.employeeCode),
        escape(row.employeeName),
        ...row.marks,
        row.totals.present,
        row.totals.halfDays,
        row.totals.absent,
        row.totals.weeklyOff,
        row.totals.weeklyOffWorked,
        row.totals.daysPayable,
      ].join(","),
    ),
    "",
    // Said out loud in the file itself, because a CSV outlives the screen that explains it.
    `"Leave types (LOP/CL/PL/SL/COFF/H) are not shown: FarmFlow does not record leave, and a 0 would claim none was taken."`,
    `"- means the worker was not on the roster that day, or the day has not happened. It is not an absence."`,
    `"WO is Sunday. WOP is a Sunday that was actually worked."`,
  ].join("\n")
}
