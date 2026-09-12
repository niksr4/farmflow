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
import { formatHoursHm } from "@/lib/attendance-hours"

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

describe("average hours per day", () => {
  /**
   * ⚠ THE DENOMINATOR IS THE WHOLE FEATURE.
   *
   * Hours exist only where the terminal recorded BOTH punches. Measured on production over 60
   * days: HoneyFarm 220 of 526 attendance rows (42%) have both; Medappa, Laxmi and Seshagiri have
   * ZERO, because they mark the muster by hand.
   *
   * Dividing total hours by days PRESENT would show HoneyFarm 3:38 against a true 8:39, and would
   * show the other three estates 0:00 — "nobody works here", about estates whose muster is full
   * every day. Both are arithmetically defensible and both are lies, which is this codebase's
   * signature failure.
   */
  const dayWithHours = (iso: string, hours: number) => ({ [iso]: hours })

  it("averages over the days that were timed, not the days present", () => {
    // Four days present, two of them timed at 8:00 and 9:00. The average is 8:30, not 4:15.
    const worker: YearlyAttendanceInput = {
      employeeCode: "1",
      employeeName: "Bopaiah",
      creditedByDate: {
        "2026-08-03": 1, "2026-08-04": 1, "2026-08-05": 1, "2026-08-06": 1,
      },
      hoursByDate: { ...dayWithHours("2026-08-03", 8), ...dayWithHours("2026-08-04", 9) },
      onRosterFrom: "2026-01-01",
    }
    const m = buildYearlyAttendance([worker], ["2026-08"], "2026-08-31")[0].months[0]
    expect(m.present).toBe(4)
    expect(m.clockedDays).toBe(2)
    expect(m.averageHours).toBe(8.5)
  })

  it("is null, never zero, for an estate that marks attendance by hand", () => {
    // Medappa, Laxmi and Seshagiri. 0:00 would read as "worked no hours"; "—" reads as "not timed".
    const worker: YearlyAttendanceInput = {
      employeeCode: "7",
      employeeName: "Manual",
      creditedByDate: { "2026-08-03": 1, "2026-08-04": 1 },
      onRosterFrom: "2026-01-01",
    }
    const m = buildYearlyAttendance([worker], ["2026-08"], "2026-08-31")[0].months[0]
    expect(m.present).toBe(2)
    expect(m.averageHours).toBeNull()
    expect(m.clockedDays).toBe(0)
  })

  it("ignores a day with only one punch rather than counting it as zero hours", () => {
    /**
     * "Chandra, in 08:03:47, out 00:00" in HoneyFarm's own daily sheet — present, finish never
     * recorded. Treating that as a zero-hour day would drag a 9-hour average down to 4:30.
     * The route's WHERE requires both punches, so such days never reach here at all.
     */
    const worker: YearlyAttendanceInput = {
      employeeCode: "3",
      employeeName: "Chandra",
      creditedByDate: { "2026-08-03": 1, "2026-08-04": 1 },
      hoursByDate: dayWithHours("2026-08-03", 9),
      onRosterFrom: "2026-01-01",
    }
    const m = buildYearlyAttendance([worker], ["2026-08"], "2026-08-31")[0].months[0]
    expect(m.averageHours).toBe(9)
    expect(m.clockedDays).toBe(1)
  })

  it("buckets hours into the month they fall in", () => {
    const worker: YearlyAttendanceInput = {
      employeeCode: "1",
      employeeName: "Split",
      creditedByDate: { "2026-07-06": 1, "2026-08-03": 1 },
      hoursByDate: { "2026-07-06": 7, "2026-08-03": 9 },
      onRosterFrom: "2026-01-01",
    }
    const [july, august] = buildYearlyAttendance([worker], ["2026-07", "2026-08"], "2026-08-31")[0].months
    expect(july.averageHours).toBe(7)
    expect(august.averageHours).toBe(9)
  })

  it("the year average weights by DAY, not by month", () => {
    /**
     * Twenty days at 9h in August and one day at 1h in September. Weighted by day the year is
     * 8:36; a mean of the two monthly means would be 5:00 — letting a single day outweigh twenty.
     * The same error as averaging an average price across unequal quantities.
     */
    const august = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`2026-08-${String(i + 3).padStart(2, "0")}`, 9]),
    )
    const worker: YearlyAttendanceInput = {
      employeeCode: "1",
      employeeName: "Weighted",
      creditedByDate: { ...Object.fromEntries(Object.keys(august).map((d) => [d, 1])), "2026-09-01": 1 },
      hoursByDate: { ...august, "2026-09-01": 1 },
      onRosterFrom: "2026-01-01",
    }
    const row = buildYearlyAttendance([worker], ["2026-08", "2026-09"], "2026-09-30")[0]
    expect(row.year.clockedDays).toBe(21)
    expect(row.year.averageHours).toBeCloseTo((20 * 9 + 1) / 21, 4)
    expect(row.year.averageHours).not.toBe(5)
  })

  it("the estate total is also weighted by day rather than by worker", () => {
    // One worker with ten timed days at 9h and one with a single 1h day is not a 5h estate.
    const busy: YearlyAttendanceInput = {
      employeeCode: "1", employeeName: "Busy", onRosterFrom: "2026-01-01",
      creditedByDate: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`2026-08-${String(i + 3).padStart(2, "0")}`, 1])),
      hoursByDate: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`2026-08-${String(i + 3).padStart(2, "0")}`, 9])),
    }
    const rare: YearlyAttendanceInput = {
      employeeCode: "2", employeeName: "Rare", onRosterFrom: "2026-01-01",
      creditedByDate: { "2026-08-03": 1 },
      hoursByDate: { "2026-08-03": 1 },
    }
    const s = summariseYearlyAttendance(buildYearlyAttendance([busy, rare], ["2026-08"], "2026-08-31"))
    expect(s.clockedDays).toBe(11)
    expect(s.averageHours).toBeCloseTo((10 * 9 + 1) / 11, 4)
  })

  it("prints h:mm, the way the estate's existing Duration column does", () => {
    expect(formatHoursHm(8.5)).toBe("8:30")
    expect(formatHoursHm(8.65)).toBe("8:39")
    expect(formatHoursHm(7.75)).toBe("7:45")
    expect(formatHoursHm(8.0833)).toBe("8:05")
    // Never a bare 0 for "not measured".
    expect(formatHoursHm(null)).toBe("—")
  })

  it("carries the average and its denominator into the CSV", () => {
    const worker: YearlyAttendanceInput = {
      employeeCode: "1", employeeName: "Bopaiah", onRosterFrom: "2026-01-01",
      creditedByDate: { "2026-08-03": 1, "2026-08-04": 1 },
      hoursByDate: { "2026-08-03": 8, "2026-08-04": 9 },
    }
    const csv = yearlyAttendanceToCsv(buildYearlyAttendance([worker], ["2026-08"], "2026-08-31"), ["2026-08"], "Honey Farm")
    expect(csv).toContain("Avg hrs/day,Days timed")
    expect(csv).toContain("8:30,2")
  })
})

describe("a worker who has left stops accruing absences", () => {
  /**
   * ⚠ THE REPORT INCLUDES ANYONE WITH A RECORD IN THE RANGE, which is right — deactivating
   * somebody today must not erase the months they worked. But with no end date, a worker
   * deactivated in March who has a March record appeared in a Jan–Sep report and was marked A for
   * every working day from April onward: roughly 130 failures to turn up that nobody could have
   * incurred, and a yearly sheet that disagreed with the monthly ones for those months.
   *
   * Raised by Greptile, 2026-09-11.
   *
   * We do not know when anyone LEFT — attendance_workers records active and created_at, nothing
   * else. We know when they were last SEEN. Blank after that says "not on the roll", which the
   * data supports; "absent" asserts they were expected and did not come, which it does not.
   */
  const leaver: YearlyAttendanceInput = {
    employeeCode: "12",
    employeeName: "Left in March",
    creditedByDate: Object.fromEntries(
      buildMonthDays("2026-03").filter((d) => !d.isWeeklyOff).map((d) => [d.iso, 1]),
    ),
    onRosterFrom: "2026-01-01",
    onRosterUntil: "2026-03-31",
  }

  const report = buildYearlyAttendance([leaver], ["2026-03", "2026-04", "2026-05"], "2026-09-11")[0]

  it("still shows the months they did work", () => {
    const march = report.months.find((m) => m.month === "2026-03")!
    expect(march.present).toBe(26)
    expect(march.absent).toBe(0)
  })

  it("records no absence at all for the months after they left", () => {
    for (const month of ["2026-04", "2026-05"]) {
      const m = report.months.find((x) => x.month === month)!
      expect(m.absent, `${month} invented absences for a departed worker`).toBe(0)
      expect(m.present).toBe(0)
      // And no pay days either — a blank month is not a paid month.
      expect(m.payDays).toBe(0)
      expect(m.weeklyOff).toBe(0)
    }
  })

  it("the year totals only what they were actually there for", () => {
    expect(report.year.absent).toBe(0)
    expect(report.year.present).toBe(26)
  })

  it("without an end date the old behaviour returns, which is what made this worth fixing", () => {
    // Same worker, no onRosterUntil: April and May fill with absences.
    const { onRosterUntil: _drop, ...noEnd } = leaver
    const stillListed = buildYearlyAttendance([noEnd], ["2026-04"], "2026-09-11")[0].months[0]
    expect(stillListed.absent).toBeGreaterThan(20)
  })

  it("a worker still on the roll is unaffected", () => {
    const active: YearlyAttendanceInput = {
      employeeCode: "1",
      employeeName: "Still here",
      creditedByDate: { "2026-04-06": 1 },
      onRosterFrom: "2026-01-01",
      onRosterUntil: null,
    }
    const m = buildYearlyAttendance([active], ["2026-04"], "2026-04-30")[0].months[0]
    expect(m.present).toBe(1)
    expect(m.absent).toBeGreaterThan(20)
  })

  it("the yearly and monthly sheets agree for a departed worker, which they did not before", () => {
    // The invariant the rest of this file asserts, now checked on the case that broke it.
    const april = buildMonthlyAttendance([leaver], buildMonthDays("2026-04"), "2026-09-11")[0].totals
    const fromYear = report.months.find((m) => m.month === "2026-04")!
    expect(fromYear.absent).toBe(april.absent)
    expect(fromYear.present).toBe(april.present)
    expect(fromYear.totalPresent).toBe(april.daysPayable)
  })
})
