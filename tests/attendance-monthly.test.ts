import { describe, expect, it } from "vitest"

import {
  buildMonthDays,
  buildMonthlyAttendance,
  formatDayHeader,
  formatMonthRange,
  monthlyAttendanceToCsv,
  summariseMonthlyAttendance,
  type MonthlyAttendanceInput,
} from "../lib/attendance-monthly"

const AUGUST = buildMonthDays("2026-08")
// A date AFTER the month, so "the month is complete" tests are unambiguous. Using the 31st
// itself made them quietly depend on the still-running-day rule.
const MONTH_COMPLETE = "2026-09-05"

const worker = (overrides: Partial<MonthlyAttendanceInput> = {}): MonthlyAttendanceInput => ({
  employeeCode: "1",
  employeeName: "Bopaiah",
  creditedByDate: {},
  onRosterFrom: "2026-08-01",
  ...overrides,
})

const full = (...days: number[]) =>
  Object.fromEntries(days.map((d) => [`2026-08-${String(d).padStart(2, "0")}`, 1]))

describe("the month itself", () => {
  it("has the right number of days and knows the weekdays", () => {
    expect(AUGUST).toHaveLength(31)
    expect(AUGUST[0]).toMatchObject({ iso: "2026-08-01", dayOfMonth: 1, weekday: "Sat", isWeeklyOff: false })
    expect(AUGUST[1]).toMatchObject({ iso: "2026-08-02", weekday: "Sun", isWeeklyOff: true })
  })

  it("marks exactly the Sundays as the weekly off", () => {
    // 2, 9, 16, 23, 30 -- the same five the printed sheet shows.
    expect(AUGUST.filter((d) => d.isWeeklyOff).map((d) => d.dayOfMonth)).toEqual([2, 9, 16, 23, 30])
  })

  it("handles February and leap years", () => {
    expect(buildMonthDays("2026-02")).toHaveLength(28)
    expect(buildMonthDays("2028-02")).toHaveLength(29)
  })

  it("rejects anything that is not YYYY-MM", () => {
    for (const bad of ["2026-13", "2026-00", "2026", "aug", "2026-8"]) {
      expect(buildMonthDays(bad)).toEqual([])
    }
  })

  it("formats the headers the way the printed sheet does", () => {
    expect(formatDayHeader(AUGUST[0])).toBe("01-Aug")
    expect(formatMonthRange(AUGUST)).toBe("01-Aug-2026 to 31-Aug-2026")
  })
})

/**
 * Reproduces row 1 of HoneyFarm's own August sheet: Bopaiah, 22 present, 4 absent, 5 weekly off.
 * Matching a report the office already holds is the only real test of a format -- a grid that is
 * internally consistent but disagrees with their sheet by one day is worse than no grid.
 */
describe("a real row from the estate's own report", () => {
  const bopaiahPresent = [1, 3, 4, 5, 6, 10, 11, 13, 14, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 31]

  it("reproduces 22 P, 4 A, 5 WO", () => {
    const [row] = buildMonthlyAttendance(
      [worker({ creditedByDate: full(...bopaiahPresent) })],
      AUGUST,
      MONTH_COMPLETE,
    )
    expect(row.totals.present).toBe(22)
    expect(row.totals.absent).toBe(4)
    expect(row.totals.weeklyOff).toBe(5)
    expect(row.marks[0]).toBe("P")
    expect(row.marks[1]).toBe("WO")
    expect(row.marks[6]).toBe("A")
  })
})

describe("every day of the month is accounted for", () => {
  it("the six buckets always sum to the days in the month", () => {
    // The invariant that makes the sheet checkable: if these do not add up, a day has been
    // double-counted or lost, and payroll is being computed off it.
    const rows = buildMonthlyAttendance(
      [
        worker({ creditedByDate: full(1, 3, 4) }),
        worker({ employeeName: "Half", creditedByDate: { "2026-08-03": 0.5, "2026-08-04": 1 } }),
        worker({ employeeName: "Late", onRosterFrom: "2026-08-25", creditedByDate: full(25, 26) }),
        worker({ employeeName: "Sunday", creditedByDate: full(2, 9) }),
      ],
      AUGUST,
      MONTH_COMPLETE,
    )
    for (const row of rows) {
      const t = row.totals
      expect(t.present + t.halfDays + t.absent + t.weeklyOff + t.weeklyOffWorked + t.notOnRoster).toBe(31)
      expect(row.marks).toHaveLength(31)
    }
  })
})

describe("a dash is not an absence", () => {
  it("leaves days before the worker joined blank", () => {
    // HoneyFarm and Seshagiri both began marking on 24-25 August. Counting the first three weeks
    // as absences would open their sheet with 20+ A per worker and read as a collapsed workforce.
    const [row] = buildMonthlyAttendance(
      [worker({ onRosterFrom: "2026-08-25", creditedByDate: full(25, 26, 27) })],
      AUGUST,
      MONTH_COMPLETE,
    )
    expect(row.marks.slice(0, 24).every((m) => m === "-")).toBe(true)
    expect(row.totals.notOnRoster).toBe(24)
    expect(row.totals.absent).toBe(3) // 28, 29, 31 -- the 30th is a Sunday
  })

  it("leaves days that have not happened blank", () => {
    const [row] = buildMonthlyAttendance([worker({ creditedByDate: full(1, 3) })], AUGUST, "2026-08-05")
    expect(row.marks[5]).toBe("-") // the 6th, still to come
    expect(row.totals.absent).toBe(1) // only the 4th; the 2nd is Sunday and the 5th is today
  })

  it("does not call anyone absent on a day that is still running", () => {
    // The roll gets taken mid-morning, later when the manager is out on the blocks. Marking
    // everyone absent until then makes the month-to-date count wrong all morning and right by
    // evening -- which is exactly the kind of confidently-wrong number this app keeps producing.
    const [row] = buildMonthlyAttendance([worker({ creditedByDate: full(1, 3) })], AUGUST, "2026-08-05")
    expect(row.marks[4]).toBe("-")
  })

  it("still marks today present once the roll is taken", () => {
    const [row] = buildMonthlyAttendance([worker({ creditedByDate: full(1, 3, 5) })], AUGUST, "2026-08-05")
    expect(row.marks[4]).toBe("P")
  })

  it("still shows a Sunday as the day off even when it is today", () => {
    const [row] = buildMonthlyAttendance([worker()], AUGUST, "2026-08-02")
    expect(row.marks[1]).toBe("WO")
  })

  it("does not pay for a blank day", () => {
    const [row] = buildMonthlyAttendance([worker({ onRosterFrom: "2026-09-01" })], AUGUST, MONTH_COMPLETE)
    expect(row.totals.daysPayable).toBe(0)
    expect(row.totals.notOnRoster).toBe(31)
  })
})

describe("a Sunday somebody worked is not a day off", () => {
  it("marks it WOP and pays it", () => {
    // Medappa have 8 of these. The derived weekly off has to yield to evidence -- the estate did
    // not tell us Sunday is off, we inferred it, so a record on a Sunday outranks the inference.
    const [row] = buildMonthlyAttendance([worker({ creditedByDate: full(2, 9) })], AUGUST, MONTH_COMPLETE)
    expect(row.marks[1]).toBe("WOP")
    expect(row.totals.weeklyOffWorked).toBe(2)
    expect(row.totals.weeklyOff).toBe(3)
    expect(row.totals.daysPayable).toBe(2)
  })
})

describe("half days", () => {
  it("marks 0.5 as HP and pays half", () => {
    const [row] = buildMonthlyAttendance(
      [worker({ creditedByDate: { "2026-08-03": 0.5, "2026-08-04": 1 } })],
      AUGUST,
      MONTH_COMPLETE,
    )
    expect(row.marks[2]).toBe("HP")
    expect(row.marks[3]).toBe("P")
    expect(row.totals.halfDays).toBe(1)
    expect(row.totals.daysPayable).toBe(1.5)
  })

  it("treats two half-day jobs on one day as a full day", () => {
    // The route sums day_fraction per worker per date before this sees it, so a worker split
    // across two jobs arrives as 1 and must not be halved twice.
    const [row] = buildMonthlyAttendance([worker({ creditedByDate: { "2026-08-03": 1 } })], AUGUST, MONTH_COMPLETE)
    expect(row.marks[2]).toBe("P")
    expect(row.totals.daysPayable).toBe(1)
  })
})

describe("the summary", () => {
  it("counts workers who never turned up", () => {
    const rows = buildMonthlyAttendance(
      [worker({ creditedByDate: full(1) }), worker({ employeeName: "Nabeesa" })],
      AUGUST,
      MONTH_COMPLETE,
    )
    const summary = summariseMonthlyAttendance(rows, AUGUST)
    expect(summary.workers).toBe(2)
    expect(summary.neverPresent).toBe(1)
    expect(summary.totalPayableDays).toBe(1)
  })
})

describe("the CSV", () => {
  const rows = buildMonthlyAttendance([worker({ creditedByDate: full(1, 3) })], AUGUST, MONTH_COMPLETE)
  const csv = monthlyAttendanceToCsv(rows, AUGUST, "Honey Farm")

  it("carries both header rows, as the printed sheet does", () => {
    expect(csv).toContain("01-Aug")
    expect(csv).toContain("1-Sat")
    expect(csv).toContain("Monthly Basic Attendance Report")
    expect(csv).toContain("01-Aug-2026 to 31-Aug-2026")
  })

  it("quotes a name containing a comma so the columns do not shift", () => {
    const tricky = buildMonthlyAttendance([worker({ employeeName: "Rai, Gagan" })], AUGUST, MONTH_COMPLETE)
    expect(monthlyAttendanceToCsv(tricky, AUGUST, "Estate")).toContain('"Rai, Gagan"')
  })

  it("says out loud what the marks mean and what is missing", () => {
    // The file outlives the screen that explains it.
    expect(csv).toContain("not on the roster")
    expect(csv).toContain("does not record leave")
  })
})
