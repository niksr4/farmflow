import { describe, expect, it } from "vitest"

import { computeWorkerPay, type PeriodInput } from "../lib/payroll-period"
import type { PayRule } from "../lib/pay-rules"

/**
 * Retention is held against DAYS WORKED, never against a monthly salary — on purpose.
 *
 * Raised by Greptile on the pay-rules PR, 2026-09-11: "a monthly-paid worker can receive salary
 * without having any labour_assignments, so the salary is included in gross while retention stays
 * zero, overstating net pay."
 *
 * That is an accurate description of what the code does. It is not a bug, and the difference
 * matters: the only retention rule any estate has ever stated is Manoj's, "20% of the day's pay".
 * A day is the unit. A salaried writer does not have one, and inventing one means deciding on the
 * estate's behalf whether a month is 26 days or 30, and whether somebody on leave is retained
 * from. Nobody has been asked.
 *
 * So this file exists to make the behaviour a DECISION rather than an accident. Nothing here
 * asserts that the current answer is the right one forever — it asserts that changing it is a
 * change, which is the part that was missing.
 *
 * Nobody is exposed today: production carries zero pay rules, and the only two monthly-paid
 * workers (Kushalappa and Prakash, both at Laxmi) belong to a tenant with none.
 */

const twentyPercent: PayRule = {
  workerId: null,
  effectiveFrom: "2026-04-01",
  retentionMode: "percent_of_day",
  retentionValue: 20,
  overtimeMode: null,
  overtimeValue: null,
  fullDayHours: 8,
  pfPercent: null,
}

const base = (over: Partial<PeriodInput> = {}): PeriodInput => ({
  rules: [twentyPercent],
  workedDays: [],
  overtimeDays: [],
  ledger: [],
  periodStart: "2026-08-03",
  ...over,
})

describe("a salary is not retained from", () => {
  it("holds nothing when the worker has no days on the muster", () => {
    // Rs 16,000 of salary reaches gross through the route's salary_earnings CTE, which arrives
    // here as the `gross` argument. No worked days means no day to take a percentage of.
    const p = computeWorkerPay(base(), "prakash", 16000)
    expect(p.retention).toBe(0)
    expect(p.net).toBe(16000)
  })

  it("holds against the days they DO appear for, and only those", () => {
    /**
     * The case that shows this is a rule rather than a gap. A salaried worker who also works two
     * days on the muster is retained for those two days at the muster rate — not for the salary
     * riding alongside it.
     *
     * Rs 16,000 salary + 2 days x Rs 600 = Rs 17,200 gross; retention is 20% of Rs 1,200 = Rs 240.
     */
    const p = computeWorkerPay(
      base({
        workedDays: [
          { workerId: "prakash", workDate: "2026-08-03", dayFraction: 1, rate: 600 },
          { workerId: "prakash", workDate: "2026-08-04", dayFraction: 1, rate: 600 },
        ],
      }),
      "prakash",
      17200,
    )
    expect(p.retention).toBe(240)
    expect(p.net).toBe(17200 - 240)
  })

  it("does not silently treat the salary as a day rate", () => {
    // The tempting wrong fix: divide the month by something and retain from that. 20% of
    // Rs 16,000 would be Rs 3,200, and an estate that never asked for it would find a third of a
    // writer's pay withheld. Asserting the number it must NOT be.
    const p = computeWorkerPay(base(), "prakash", 16000)
    expect(p.retention).not.toBe(3200)
    expect(p.retention).toBe(0)
  })

  it("an estate with no rules retains nothing from anybody, salaried or not", () => {
    // The standing guarantee for the three live tenants who set no rules at all.
    const p = computeWorkerPay(base({ rules: [] }), "prakash", 16000)
    expect(p.retention).toBe(0)
    expect(p.hasRule).toBe(false)
    expect(p.net).toBe(16000)
  })

  it("the decision is written down where the code makes it", () => {
    // A test pinning behaviour is worth little if the next reader cannot find out why. If the
    // explanation moves or is deleted, this fails and asks for it back.
    const src = require("node:fs").readFileSync(
      require("node:path").resolve(__dirname, "../lib/payroll-period.ts"),
      "utf8",
    )
    expect(src).toMatch(/RETENTION IS HELD AGAINST DAYS WORKED, NOT AGAINST A MONTHLY SALARY/)
  })
})
