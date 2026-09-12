import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  instalmentDueInPeriod,
  instalmentsDueInRange,
  recoveredBeforeDate,
  type LedgerEntry,
} from "@/lib/pay-rules"
import { computeWorkerPay, weekRangeFor, type PeriodInput } from "@/lib/payroll-period"

/**
 * A payroll range is not always one payroll run.
 *
 * THE BUG THIS EXISTS FOR. Advance recovery was computed from `periodStart` alone with the run
 * length left at its default of seven days by every caller — while the screen opens on
 * month-to-date and its date boxes accept any range at all. So generating payroll for August took
 * ONE weekly instalment for four weeks of work, and then reported the worker still owing the three
 * instalments it had quietly skipped. Rs 2,000 taken where Rs 8,000 was due, and Rs 18,000 shown
 * outstanding against a true Rs 12,000.
 *
 * Nothing on the screen said which unit was in play. The code even carried a comment predicting
 * this — "an arbitrary nine-day range would take one instalment for nine days' work" — as a reason
 * to prefer the week buttons, next to date inputs that let anyone do it anyway and a default that
 * did it on first load.
 *
 * The generalisation must agree with the thing it generalises, or it has replaced one wrong answer
 * with another. That equivalence is the first test below and it is the load-bearing one.
 */

const advance = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: "a1",
  entryType: "advance",
  entryDate: "2026-08-05",
  amount: 20000,
  recoverOverPeriods: 10,
  recoverFrom: null,
  ...over,
})

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)

describe("a range of exactly one run is exactly one run", () => {
  it("agrees with instalmentDueInPeriod on every weekly run around the advance", () => {
    // The sweep is the point. A single offset cannot tell a correct generalisation from one that
    // happens to line up -- the original ordinal bug survived a whole test file for that reason.
    const e = advance()
    for (let offset = -21; offset <= 90; offset += 1) {
      const start = addDays("2026-08-02", offset)
      const end = addDays(start, 6)
      expect(
        instalmentsDueInRange(e, start, end, 7),
        `week starting ${start} disagrees with the single-run figure`,
      ).toBe(instalmentDueInPeriod(e, start, 7))
    }
  })

  it("agrees for a one-off advance too, where there is a single instalment to place", () => {
    const e = advance({ recoverOverPeriods: 1, amount: 3000 })
    for (let offset = -14; offset <= 28; offset += 1) {
      const start = addDays("2026-08-02", offset)
      expect(instalmentsDueInRange(e, start, addDays(start, 6), 7)).toBe(instalmentDueInPeriod(e, start, 7))
    }
  })
})

describe("a month recovers what the weeks inside it recover", () => {
  it("takes four instalments from August, not one", () => {
    // The reported figure was 2000. Four weekly runs fall inside the month: Aug 5, 12, 19 and 26.
    expect(instalmentsDueInRange(advance(), "2026-08-01", "2026-08-31", 7)).toBe(8000)
  })

  it("sums to the same money as running each week separately", () => {
    const e = advance()
    let weekly = 0
    // Sunday-to-Saturday weeks wholly inside August, which is what an estate paying on a Saturday
    // would actually have run.
    for (let start = "2026-08-02"; start <= "2026-08-23"; start = addDays(start, 7)) {
      weekly += instalmentDueInPeriod(e, start, 7)
    }
    expect(instalmentsDueInRange(e, "2026-08-02", "2026-08-29", 7)).toBe(weekly)
  })

  it("stops when the schedule is done rather than counting the range out", () => {
    // A whole year asked for at once must still recover ten instalments, not fifty-two.
    expect(instalmentsDueInRange(advance(), "2026-01-01", "2026-12-31", 7)).toBe(20000)
  })

  it("recovers nothing from a range that ends before the money was handed over", () => {
    expect(instalmentsDueInRange(advance(), "2026-07-01", "2026-08-04", 7)).toBe(0)
  })

  it("honours recover_from over the entry date, so recovery can be deferred", () => {
    const e = advance({ recoverFrom: "2026-09-06" })
    expect(instalmentsDueInRange(e, "2026-08-01", "2026-08-31", 7)).toBe(0)
    expect(instalmentsDueInRange(e, "2026-09-01", "2026-09-30", 7)).toBe(8000)
  })

  it("refuses a backwards range instead of returning something", () => {
    expect(instalmentsDueInRange(advance(), "2026-08-31", "2026-08-01", 7)).toBe(0)
  })
})

describe("what an advance had already given up before a date", () => {
  it("counts nothing before the first instalment falls due", () => {
    expect(recoveredBeforeDate(advance(), "2026-08-05", 7)).toBe(0)
    expect(recoveredBeforeDate(advance(), "2026-07-01", 7)).toBe(0)
  })

  it("counts each instalment once, from the advance's own start", () => {
    expect(recoveredBeforeDate(advance(), "2026-08-06", 7)).toBe(2000)
    expect(recoveredBeforeDate(advance(), "2026-08-12", 7)).toBe(2000)
    expect(recoveredBeforeDate(advance(), "2026-08-13", 7)).toBe(4000)
  })

  it("never exceeds the advance, however far in the future the date is", () => {
    expect(recoveredBeforeDate(advance(), "2030-01-01", 7)).toBe(20000)
  })
})

describe("the whole-month payroll a screen would actually ask for", () => {
  const workedDays = Array.from({ length: 24 }, (_, i) => ({
    workerId: "w1",
    workDate: addDays("2026-08-03", i),
    dayFraction: 1,
    rate: 600,
  }))

  const monthInput: PeriodInput = {
    rules: [
      {
        workerId: null,
        effectiveFrom: "2026-01-01",
        retentionMode: "percent_of_day",
        retentionValue: 20,
        overtimeMode: null,
        overtimeValue: null,
        fullDayHours: null,
        pfPercent: null,
      },
    ],
    workedDays,
    overtimeDays: [],
    ledger: [{ ...advance(), workerId: "w1" }],
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
  }

  it("recovers the four instalments the month contains", () => {
    const pay = computeWorkerPay(monthInput, "w1", 24 * 600)
    expect(pay.advanceDue).toBe(8000)
    expect(pay.advanceRecovered).toBe(8000)
    expect(pay.shortfall).toBe(0)
  })

  it("leaves the right balance rather than one three instalments too high", () => {
    // 20,000 advanced, nothing recovered before August, 8,000 taken in it.
    expect(computeWorkerPay(monthInput, "w1", 24 * 600).owedAfter).toBe(12000)
  })

  it("still holds retention day by day across the month", () => {
    // 24 full days at Rs 600, 20% each. Not 20% of a month total computed once.
    expect(computeWorkerPay(monthInput, "w1", 24 * 600).retention).toBe(24 * 120)
  })

  /** One week, with only that week's days in it — which is what the route's queries return. */
  const week = (anchor: string) => {
    const { start, end } = weekRangeFor(anchor)
    const days = workedDays.filter((d) => d.workDate >= start && d.workDate <= end)
    return computeWorkerPay(
      { ...monthInput, workedDays: days, periodStart: start, periodEnd: end },
      "w1",
      days.length * 600,
    )
  }
  const weeks = ["2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26"].map(week)

  it("schedules the same four instalments whether asked week by week or all at once", () => {
    // The schedule is the part that must agree exactly, and the part that was wrong: the month used
    // to schedule one instalment where the weeks scheduled four.
    expect(weeks.reduce((sum, w) => sum + w.advanceDue, 0)).toBe(8000)
    expect(computeWorkerPay(monthInput, "w1", 24 * 600).advanceDue).toBe(8000)
  })

  it("but recovers Rs 80 less across the weeks, because a thin week caps recovery", () => {
    /**
     * NOT A DISAGREEMENT — the documented limit of asking for a month.
     *
     * The last week has four working days: Rs 2,400 gross, Rs 480 held, Rs 1,920 left, against a
     * Rs 2,000 instalment. The week can only take Rs 1,920 and says so. The month caps once against
     * the whole month's earnings, which comfortably covers all four instalments, so it reports no
     * shortfall at all.
     *
     * Pay from the week. The month is for reconciling, and this is the one line where the two
     * legitimately differ.
     */
    expect(weeks.reduce((sum, w) => sum + w.advanceRecovered, 0)).toBe(7920)
    expect(weeks[3].shortfall).toBe(80)
    expect(computeWorkerPay(monthInput, "w1", 24 * 600).advanceRecovered).toBe(8000)
  })

  it("carries a shortfall on the run it happened rather than into the next one", () => {
    // Stated, never rolled forward. The estate decides what to do about Rs 80, not the software.
    expect(weeks.slice(0, 3).every((w) => w.shortfall === 0)).toBe(true)
  })
})

describe("a caller that names only a start date still means one run", () => {
  const base: PeriodInput = {
    rules: [],
    workedDays: [{ workerId: "w1", workDate: "2026-08-10", dayFraction: 1, rate: 600 }],
    overtimeDays: [],
    ledger: [{ ...advance(), workerId: "w1" }],
    periodStart: "2026-08-09",
  }

  it("derives the end of the run rather than recovering forever", () => {
    // Every existing caller and test omits periodEnd; without a derived end an open range would
    // recover the entire schedule in one go.
    expect(computeWorkerPay(base, "w1", 4200).advanceDue).toBe(2000)
  })

  it("gives the same answer as spelling the end date out", () => {
    expect(computeWorkerPay({ ...base, periodEnd: "2026-08-15" }, "w1", 4200)).toEqual(
      computeWorkerPay(base, "w1", 4200),
    )
  })
})

describe("overtime is priced from the day it was worked, or the worker's own rate", () => {
  const rules = [
    {
      workerId: null,
      effectiveFrom: "2026-01-01",
      retentionMode: null,
      retentionValue: null,
      overtimeMode: "multiplier_of_hourly" as const,
      overtimeValue: 1.5,
      fullDayHours: 8,
      pfPercent: null,
    },
  ]

  it("uses the roster rate when the muster has nothing for that day", () => {
    /**
     * THE BUG: this fell back to `days[0].rate` -- whichever worked day the query happened to
     * return first. Three of the four live estates mark attendance without allocating work, so
     * overtime would have been priced off an unrelated day at an unrelated rate.
     */
    const pay = computeWorkerPay(
      {
        rules,
        workedDays: [{ workerId: "w1", workDate: "2026-08-03", dayFraction: 1, rate: 900 }],
        overtimeDays: [{ workerId: "w1", workDate: "2026-08-06", hours: 2 }],
        ledger: [],
        periodStart: "2026-08-02",
      },
      "w1",
      900,
      { fallbackDayRate: 600 },
    )
    // 600 / 8 = 75/h, x1.5 = 112.50, x2h = 225. Off the Rs 900 day it would have been 337.50.
    expect(pay.overtime).toBe(225)
  })

  it("prefers that day's own rate when there is one", () => {
    const pay = computeWorkerPay(
      {
        rules,
        workedDays: [{ workerId: "w1", workDate: "2026-08-06", dayFraction: 1, rate: 800 }],
        overtimeDays: [{ workerId: "w1", workDate: "2026-08-06", hours: 2 }],
        ledger: [],
        periodStart: "2026-08-02",
      },
      "w1",
      800,
      { fallbackDayRate: 600 },
    )
    expect(pay.overtime).toBe(300)
  })

  it("pays nothing rather than guessing when neither is known", () => {
    const pay = computeWorkerPay(
      {
        rules,
        workedDays: [],
        overtimeDays: [{ workerId: "w1", workDate: "2026-08-06", hours: 2 }],
        ledger: [],
        periodStart: "2026-08-02",
      },
      "w1",
      0,
    )
    expect(pay.overtime).toBe(0)
  })
})

describe("retention is a share of what the day actually earned", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8")

  it("the route divides the day's cost by the day worked instead of taking MAX(rate)", () => {
    /**
     * retentionForDay multiplies rate x day_fraction straight back up, so feeding it
     * total_cost / day_fraction makes retention exactly "20% of what the muster says they earned"
     * -- the sentence Manoj said, and the only definition that cannot drift from the labour figures
     * on every other screen.
     *
     * MAX(rate) was right only while nothing varied within a day. total_cost already carries
     * pay_multiplier, lump_sum and headcount, and the muster lets one worker take two jobs at two
     * rates. Latent today, which is not the same as fixed.
     */
    const route = read("app/api/payroll-summary/route.ts")
    expect(route).toContain("SUM(total_cost) / NULLIF(SUM(day_fraction), 0)")
    // Comment lines legitimately name MAX(rate) to explain why it is gone, so only the SQL counts --
    // the same convention as tests/booked-revenue-columns.test.ts.
    const sqlOnly = route
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\*|\/\/|--)/.test(line))
      .join("\n")
    expect(sqlOnly).not.toMatch(/MAX\(rate\)/)
  })

  it("the route passes both ends of the range, not just the start", () => {
    const route = read("app/api/payroll-summary/route.ts")
    expect(route).toContain("periodStart: startDate")
    expect(route).toContain("periodEnd: endDate")
  })

  it("the route passes the worker's own rate for pricing overtime", () => {
    expect(read("app/api/payroll-summary/route.ts")).toContain("fallbackDayRate: w.dailyRate")
  })
})
