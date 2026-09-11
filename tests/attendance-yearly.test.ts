import { describe, expect, it } from "vitest"

import {
  buildYearlyAttendance,
  formatMonthLabel,
  monthsBetween,
  summariseYearlyAttendance,
  yearlyAttendanceToCsv,
  type YearlyAttendanceInput,
} from "@/lib/attendance-yearly"
import { buildMonthDays, buildMonthlyAttendance } from "@/lib/attendance-monthly"

/**
 * The yearly summary, checked against the sheet HoneyFarm already prints.
 *
 * The expected numbers below are not invented. They are transcribed from SmartOffice's "Yearly
 * Summary Report, Jan-2026 To Sep-2026", generated 11-Sep-2026 — the report the estate office
 * actually reads. If FarmFlow is going to show a yearly attendance sheet, the first thing worth
 * proving is that it agrees with the one it is replacing.
 *
 * The WO column is the strongest check in here and it validates something beyond this file: for
 * all nine months it equals exactly the number of SUNDAYS, which confirms SmartOffice and
 * lib/attendance-monthly.ts agree that the weekly off is Sunday. That was an assumption until
 * these figures arrived.
 */

/** Bopaiah, employee code 1 — every month of his row in the real report. */
const BOPAIAH = [
  { month: "2026-01", present: 26, absent: 1, weeklyOff: 4, totalPresent: 26, payDays: 30 },
  { month: "2026-02", present: 23, absent: 1, weeklyOff: 4, totalPresent: 23, payDays: 27 },
  { month: "2026-03", present: 25, absent: 1, weeklyOff: 5, totalPresent: 25, payDays: 30 },
  { month: "2026-04", present: 22, absent: 4, weeklyOff: 4, totalPresent: 22, payDays: 26 },
  { month: "2026-05", present: 22, absent: 4, weeklyOff: 5, totalPresent: 22, payDays: 27 },
  { month: "2026-06", present: 25, absent: 1, weeklyOff: 4, totalPresent: 25, payDays: 29 },
  { month: "2026-07", present: 25, absent: 2, weeklyOff: 4, totalPresent: 25, payDays: 29 },
  { month: "2026-08", present: 22, absent: 4, weeklyOff: 5, totalPresent: 22, payDays: 27 },
  { month: "2026-09", present: 10, absent: 0, weeklyOff: 1, totalPresent: 10, payDays: 11 },
]

const TODAY = "2026-09-11"
const MONTHS = BOPAIAH.map((m) => m.month)

/**
 * Rebuild a worker's year from the month totals: mark every working day present, then drop the
 * last `absent` of them. Which days were missed is not in the report and does not matter — only
 * how many.
 */
const workerFrom = (
  name: string,
  code: string,
  plan: readonly { month: string; absent: number }[],
): YearlyAttendanceInput => {
  const creditedByDate: Record<string, number> = {}
  for (const { month, absent } of plan) {
    const working = buildMonthDays(month)
      .filter((d) => !d.isWeeklyOff && d.iso <= TODAY)
      .map((d) => d.iso)
    for (const iso of working.slice(0, working.length - absent)) creditedByDate[iso] = 1
  }
  return { employeeCode: code, employeeName: name, creditedByDate, onRosterFrom: "2025-01-01" }
}

describe("the yearly summary matches the report HoneyFarm already prints", () => {
  const rows = buildYearlyAttendance([workerFrom("Bopaiah", "1", BOPAIAH)], MONTHS, TODAY)
  const bopaiah = rows[0]

  it("produces one row per month of the range", () => {
    expect(bopaiah.months).toHaveLength(9)
    expect(bopaiah.months.map((m) => m.label)).toEqual([
      "Jan-2026", "Feb-2026", "Mar-2026", "Apr-2026", "May-2026",
      "Jun-2026", "Jul-2026", "Aug-2026", "Sep-2026",
    ])
  })

  it("counts weekly offs as the Sundays in the month, exactly as SmartOffice does", () => {
    // The check that confirms both systems mean the same thing by "weekly off". If FarmFlow ever
    // moves WEEKLY_OFF_DOW, this fails and the two sheets stop agreeing.
    expect(bopaiah.months.map((m) => m.weeklyOff)).toEqual(BOPAIAH.map((m) => m.weeklyOff))
  })

  it("reproduces P, A, Total Present and PayDays for every month of Bopaiah's year", () => {
    for (const expected of BOPAIAH) {
      const actual = bopaiah.months.find((m) => m.month === expected.month)!
      expect(
        {
          month: actual.month,
          present: actual.present,
          absent: actual.absent,
          weeklyOff: actual.weeklyOff,
          totalPresent: actual.totalPresent,
          payDays: actual.payDays,
        },
        `${expected.month} disagrees with the printed report`,
      ).toEqual(expected)
    }
  })

  it("PayDays is Total Present plus the weekly offs, on every row", () => {
    // Stated as a rule rather than only as nine transcribed numbers, so a change that happens to
    // keep Bopaiah right while breaking everyone else still fails.
    for (const m of bopaiah.months) expect(m.payDays).toBe(m.totalPresent + m.weeklyOff)
  })

  it("does not count the rest of an in-progress month as absence", () => {
    /**
     * Sep-2026 on a report generated on the 11th reads P 10, A 0 — not P 10, A 19. The month has
     * not happened yet, and a summary that fills the remainder with absences would show every
     * worker's attendance collapsing on the 1st of each month and recovering by the 30th.
     */
    const september = bopaiah.months.find((m) => m.month === "2026-09")!
    expect(september.present).toBe(10)
    expect(september.absent).toBe(0)
    expect(september.payDays).toBe(11)
  })

  it("adds the months up into a year for each worker", () => {
    expect(bopaiah.year.present).toBe(BOPAIAH.reduce((s, m) => s + m.present, 0))
    expect(bopaiah.year.payDays).toBe(BOPAIAH.reduce((s, m) => s + m.payDays, 0))
    expect(bopaiah.year.payDays).toBe(236)
  })
})

describe("it agrees with the monthly grid, because it is the monthly grid", () => {
  it("a month in the yearly report equals that month's own grid totals", () => {
    /**
     * The property that matters more than any single number: the yearly summary adds no attendance
     * rules of its own. Two sheets that count days differently is how an estate ends up with a
     * wage query nobody can settle.
     */
    const worker = workerFrom("Bopaiah", "1", BOPAIAH)
    const august = buildMonthlyAttendance([worker], buildMonthDays("2026-08"), TODAY)[0].totals
    const fromYear = buildYearlyAttendance([worker], ["2026-08"], TODAY)[0].months[0]

    expect(fromYear.present).toBe(august.present)
    expect(fromYear.absent).toBe(august.absent)
    expect(fromYear.weeklyOff).toBe(august.weeklyOff)
    expect(fromYear.totalPresent).toBe(august.daysPayable)
  })

  it("a half day is half a day present, and still a full pay day is not invented for it", () => {
    const worker: YearlyAttendanceInput = {
      employeeCode: "9",
      employeeName: "Half",
      // 2026-08-03 is a Monday; 2026-08-04 a Tuesday.
      creditedByDate: { "2026-08-03": 0.5, "2026-08-04": 1 },
      onRosterFrom: "2026-08-01",
    }
    const m = buildYearlyAttendance([worker], ["2026-08"], "2026-08-31")[0].months[0]
    expect(m.halfDays).toBe(1)
    expect(m.present).toBe(1)
    expect(m.totalPresent).toBe(1.5)
  })

  it("a worked Sunday counts once, in Total Present, not twice", () => {
    // Stated because the sample report has WOP 0 everywhere and therefore cannot settle it. If
    // HoneyFarm's figures ever disagree with ours, it will be on this row.
    const worker: YearlyAttendanceInput = {
      employeeCode: "9",
      employeeName: "Sunday",
      creditedByDate: { "2026-08-02": 1 }, // a Sunday
      onRosterFrom: "2026-08-01",
    }
    const m = buildYearlyAttendance([worker], ["2026-08"], "2026-08-31")[0].months[0]
    expect(m.weeklyOffWorked).toBe(1)
    expect(m.weeklyOff).toBe(4) // the other four Sundays
    expect(m.totalPresent).toBe(1)
    expect(m.payDays).toBe(5) // one worked Sunday + four paid ones
  })
})

describe("the month range", () => {
  it("walks inclusive, across a year boundary", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"])
  })

  it("handles a single month", () => {
    expect(monthsBetween("2026-08", "2026-08")).toEqual(["2026-08"])
  })

  it("returns nothing for an inverted or malformed range rather than throwing", () => {
    // A mistyped date should render an empty report, not a crash on a page an estate opens monthly.
    expect(monthsBetween("2026-08", "2026-01")).toEqual([])
    expect(monthsBetween("2026-8", "2026-09")).toEqual([])
    expect(monthsBetween("", "")).toEqual([])
    expect(monthsBetween("2026-13", "2026-14")).toEqual([])
  })

  it("caps the span, so a fat-fingered year cannot ask for four hundred months", () => {
    expect(monthsBetween("2020-01", "2026-09")).toEqual([])
    expect(monthsBetween("2025-01", "2026-09")).toHaveLength(21)
  })

  it("labels a month the way the report does", () => {
    expect(formatMonthLabel("2026-01")).toBe("Jan-2026")
    expect(formatMonthLabel("2026-12")).toBe("Dec-2026")
  })
})

describe("the export", () => {
  const rows = buildYearlyAttendance(
    [workerFrom("Bopaiah", "1", BOPAIAH), workerFrom("Muthu", "2", BOPAIAH)],
    ["2026-08", "2026-09"],
    TODAY,
  )

  it("totals the estate across every worker", () => {
    const s = summariseYearlyAttendance(rows)
    expect(s.workers).toBe(2)
    expect(s.payDays).toBe(rows.reduce((sum, r) => sum + r.year.payDays, 0))
  })

  it("writes a row per worker per month, plus a per-worker total", () => {
    const csv = yearlyAttendanceToCsv(rows, ["2026-08", "2026-09"], "Honey Farm")
    const lines = csv.split("\n")
    expect(lines[0]).toBe("Honey Farm")
    expect(lines[1]).toBe("Yearly Summary Report")
    expect(lines[2]).toBe("Aug-2026 to Sep-2026")
    // 2 workers x (2 months + 1 total)
    expect(lines.filter((l) => l.startsWith("1,Bopaiah"))).toHaveLength(3)
    expect(csv).toContain(",TOTAL,")
  })

  it("quotes a name containing a comma rather than splitting the row", () => {
    const tricky = buildYearlyAttendance(
      [{ employeeCode: "7", employeeName: "Rao, K", creditedByDate: {}, onRosterFrom: "2026-08-01" }],
      ["2026-08"],
      TODAY,
    )
    expect(yearlyAttendanceToCsv(tricky, ["2026-08"], "Honey Farm")).toContain('"Rao, K"')
  })
})
