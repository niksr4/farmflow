import { describe, expect, it } from "vitest"

import {
  computeWorkerPay,
  periodIndexFor,
  periodUsesRules,
  weekRangeFor,
  type PeriodInput,
} from "../lib/payroll-period"
import type { PayRule } from "../lib/pay-rules"

/**
 * The join between the database and the rules, tested without a database.
 *
 * Medappa's real configuration throughout: 20% of the day, 8-hour day, 1.2x overtime, Rs 600/day,
 * paid weekly on a Saturday.
 */

const medappa: PayRule = {
  workerId: null,
  effectiveFrom: "2026-04-01",
  retentionMode: "percent_of_day",
  retentionValue: 20,
  overtimeMode: "multiplier_of_hourly",
  overtimeValue: 1.2,
  fullDayHours: 8,
  pfPercent: null,
}

const week = (fractions: number[], rate = 600, workerId = "ravi") =>
  fractions.map((f, i) => ({
    workerId,
    workDate: `2026-08-0${3 + i}`,
    dayFraction: f,
    rate,
  }))

const base = (over: Partial<PeriodInput> = {}): PeriodInput => ({
  rules: [medappa],
  workedDays: week([1, 1, 1, 1, 1, 1]),
  overtimeDays: [],
  ledger: [],
  periodStart: "2026-08-03",
  ...over,
})

describe("a week at Medappa", () => {
  it("holds 20% of six full days", () => {
    const p = computeWorkerPay(base(), "ravi", 3600)
    expect(p.retention).toBe(720)
    expect(p.overtime).toBe(0)
  })

  it("retention is computed day by day, so a half day holds half", () => {
    // Not 20% of the period total -- the same answer here, but not once a rate or a rule moves
    // mid-week, which is exactly when a period-level percentage silently stops being right.
    const p = computeWorkerPay(base({ workedDays: week([1, 1, 0.5, 1, 1, 1]) }), "ravi", 3300)
    expect(p.retention).toBe(660)
  })

  it("prices overtime from the day's own rate at Rs 90 an hour", () => {
    const p = computeWorkerPay(
      base({ overtimeDays: [{ workerId: "ravi", workDate: "2026-08-05", hours: 3 }] }),
      "ravi",
      3600,
    )
    expect(p.overtime).toBe(270)
  })

  it("holds retention on the days, not on the overtime", () => {
    // Overtime is pay for extra hours, not an extra day. Retaining against it would hold more than
    // the rule says on a week somebody stayed late.
    const p = computeWorkerPay(
      base({ overtimeDays: [{ workerId: "ravi", workDate: "2026-08-05", hours: 3 }] }),
      "ravi",
      3600,
    )
    expect(p.retention).toBe(720)
  })

  it("uses the rate stored on the day, not a current one", () => {
    // A rate rise in September must not change what August cost. labour_assignments.rate is copied
    // at entry time for this reason; this honours it.
    const p = computeWorkerPay(base({ workedDays: week([1, 1, 1, 1, 1, 1], 500) }), "ravi", 3000)
    expect(p.retention).toBe(600)
  })
})

describe("a rule that changes mid-week", () => {
  it("applies each day's own rule, not the week's", () => {
    const rules: PayRule[] = [
      { ...medappa, effectiveFrom: "2026-04-01", retentionValue: 20 },
      { ...medappa, effectiveFrom: "2026-08-06", retentionValue: 30 },
    ]
    // 3rd–5th at 20% (Rs 360), 6th–8th at 30% (Rs 540).
    const p = computeWorkerPay(base({ rules }), "ravi", 3600)
    expect(p.retention).toBe(900)
  })
})

describe("advances across runs", () => {
  const ledger = [
    {
      workerId: "ravi",
      id: "a1",
      entryType: "advance" as const,
      entryDate: "2026-08-12",
      amount: 20000,
      recoverOverPeriods: 10,
      recoverFrom: null,
    },
  ]

  it("takes one instalment in run 0 and leaves the balance standing", () => {
    const p = computeWorkerPay(base({ ledger, periodStart: "2026-08-12" }), "ravi", 3600)
    expect(p.advanceDue).toBe(2000)
    expect(p.advanceRecovered).toBe(2000)
    expect(p.owedAfter).toBe(18000)
  })

  it("stops after the tenth run with nothing to switch off", () => {
    expect(computeWorkerPay(base({ ledger, periodStart: "2026-10-14" }), "ravi", 3600).advanceRecovered).toBe(2000)
    expect(computeWorkerPay(base({ ledger, periodStart: "2026-10-21" }), "ravi", 3600).advanceRecovered).toBe(0)
  })

  it("recovers what it can on a thin week and states the rest", () => {
    const p = computeWorkerPay(base({ ledger, workedDays: week([1, 1]), periodStart: "2026-08-12" }), "ravi", 1200)
    expect(p.retention).toBe(240)
    expect(p.advanceRecovered).toBe(960)
    expect(p.shortfall).toBe(1040)
    // The debt is reduced by what was actually taken, not by what was due.
    expect(p.owedAfter).toBe(19040)
  })
})

describe("an estate that uses none of it", () => {
  const bare: PeriodInput = { rules: [], workedDays: week([1, 1, 1]), overtimeDays: [], ledger: [], periodStart: "2026-08-03" }

  it("holds nothing, pays no overtime, and reports no rule", () => {
    const p = computeWorkerPay(bare, "ravi", 1800)
    expect(p.retention).toBe(0)
    expect(p.overtime).toBe(0)
    expect(p.advanceRecovered).toBe(0)
    expect(p.hasRule).toBe(false)
  })

  it("periodUsesRules is false, so no column appears", () => {
    expect(periodUsesRules(bare)).toBe(false)
  })

  it("but true the moment anything real exists", () => {
    expect(periodUsesRules({ ...bare, rules: [medappa] })).toBe(true)
    expect(periodUsesRules({ ...bare, overtimeDays: [{ workerId: "r", workDate: "2026-08-03", hours: 2 }] })).toBe(true)
  })

  it("a rule row that sets no rule does not count as using rules", () => {
    // An all-null row is how an estate STOPS retaining. It must not switch the columns back on.
    const stopped: PayRule = { ...medappa, retentionMode: null, retentionValue: null, overtimeMode: null, overtimeValue: null }
    expect(periodUsesRules({ ...bare, rules: [stopped] })).toBe(false)
  })
})

describe("the week runs to payday", () => {
  it("Saturday-ending, because Medappa pay on a Saturday", () => {
    // 2026-08-05 is a Wednesday; its week ends Saturday the 8th and starts Sunday the 2nd.
    expect(weekRangeFor("2026-08-05")).toEqual({ start: "2026-08-02", end: "2026-08-08" })
  })

  it("a Saturday belongs to its own week, not the next one", () => {
    expect(weekRangeFor("2026-08-08")).toEqual({ start: "2026-08-02", end: "2026-08-08" })
  })

  it("and Monday-ending works for an estate that pays then", () => {
    // Not a universal: the convention is per-estate, which is why it is an argument.
    const r = weekRangeFor("2026-08-05", 1)
    expect(r.end).toBe("2026-08-10")
    expect(r.start).toBe("2026-08-04")
  })
})

describe("which run this is", () => {
  it("counts weeks from the first", () => {
    expect(periodIndexFor("2026-08-02", "2026-08-02")).toBe(0)
    expect(periodIndexFor("2026-08-02", "2026-08-09")).toBe(1)
    expect(periodIndexFor("2026-08-02", "2026-10-11")).toBe(10)
  })

  it("never goes negative for a period before the first", () => {
    expect(periodIndexFor("2026-08-02", "2026-07-01")).toBe(0)
  })

  it("is derived, so re-running a closed week gives the same instalment", () => {
    const first = periodIndexFor("2026-08-02", "2026-08-09")
    const again = periodIndexFor("2026-08-02", "2026-08-09")
    expect(first).toBe(again)
  })
})
