import { describe, expect, it } from "vitest"

import {
  applyDeductions,
  instalmentDueInPeriod,
  outstandingAdvance,
  overtimePay,
  resolveRuleForDate,
  retentionForDay,
  retentionHeld,
  type LedgerEntry,
  type PayRule,
} from "../lib/pay-rules"

/**
 * The design walked against whole estates, not one function at a time.
 *
 * Unit tests say each piece is right. These say the pieces compose into an answer somebody would
 * recognise as their own wage sheet — which is the failure mode this product actually has: every
 * part correct, the total confidently wrong.
 *
 * Three estates, deliberately different, because the claim being tested is that none of this is
 * keyed to Medappa.
 */

const rule = (over: Partial<PayRule> = {}): PayRule => ({
  workerId: null,
  effectiveFrom: "2026-01-01",
  retentionMode: null,
  retentionValue: null,
  overtimeMode: null,
  overtimeValue: null,
  fullDayHours: null,
  pfPercent: null,
  ...over,
})

const advance = (amount: number, periods = 1, id = "adv"): LedgerEntry => ({
  id,
  entryType: "advance",
  // Same week runWeek computes by default, so recovery starts in the run under test. Recovery is
  // anchored to the advance's own date now, so a fixture dated outside the week correctly yields 0.
  entryDate: "2026-08-03",
  amount,
  recoverOverPeriods: periods,
  recoverFrom: null,
})

/** One worker's week: days worked at a rate, under a rule, against an advance. */
function runWeek(input: {
  rules: PayRule[]
  workerId: string
  weekStart: string
  days: number[] // day fractions actually worked
  dayRate: number
  overtimeHours?: number
  advances?: LedgerEntry[]
  periodStart?: string
}) {
  const r = resolveRuleForDate(input.rules, input.workerId, input.weekStart)
  const gross =
    input.days.reduce((sum, f) => sum + input.dayRate * f, 0) +
    overtimePay(r, { dayRate: input.dayRate, hours: input.overtimeHours ?? 0 })
  const retention = input.days.reduce((sum, f) => sum + retentionForDay(r, input.dayRate, f), 0)
  // Anchored to each advance's own start date, so a week that ended before the money was given
  // cannot be docked for it. `weekStart` is the run being computed.
  const advanceDue = (input.advances ?? []).reduce(
    (sum, a) => sum + instalmentDueInPeriod(a, input.periodStart ?? input.weekStart),
    0,
  )
  return { rule: r, gross, ...applyDeductions({ gross, retention, advanceDue }) }
}

// ---------------------------------------------------------------------------

describe("MEDAPPA — 29 daily workers at Rs 600, paid weekly, 20% retention", () => {
  const rules = [rule({ retentionMode: "percent_of_day", retentionValue: 20, effectiveFrom: "2026-04-01" })]

  it("an ordinary six-day week", () => {
    const w = runWeek({ rules, workerId: "ravi", weekStart: "2026-08-03", days: [1, 1, 1, 1, 1, 1], dayRate: 600 })
    expect(w.gross).toBe(3600)
    expect(w.retention).toBe(720)
    expect(w.net).toBe(2880)
  })

  it("a week with a half day holds half on that day", () => {
    const w = runWeek({ rules, workerId: "ravi", weekStart: "2026-08-03", days: [1, 1, 0.5, 1, 1, 1], dayRate: 600 })
    expect(w.gross).toBe(3300)
    expect(w.retention).toBe(660)
    expect(w.net).toBe(2640)
  })

  it("Rs 20,000 over ten runs takes Rs 2,000 a week and then stops", () => {
    const adv = [advance(20000, 10)]
    const week = (i: number) =>
      runWeek({ rules, workerId: "ravi", weekStart: "2026-08-03", days: [1, 1, 1, 1, 1, 1], dayRate: 600, advances: adv, periodStart: new Date(Date.parse("2026-08-03T00:00:00Z") + i * 7 * 86400000).toISOString().slice(0, 10) })

    expect(week(0).advanceRecovered).toBe(2000)
    expect(week(0).net).toBe(880)
    expect(week(9).advanceRecovered).toBe(2000)
    // The eleventh week: nothing, and nobody ticked anything to make that happen.
    expect(week(10).advanceRecovered).toBe(0)
    expect(week(10).net).toBe(2880)
  })

  it("a thin week cannot pay a negative wage, and says what it could not take", () => {
    // Two days worked against a Rs 2,000 instalment.
    const w = runWeek({
      rules,
      workerId: "ravi",
      weekStart: "2026-08-03",
      days: [1, 1],
      dayRate: 600,
      advances: [advance(20000, 10)],
    })
    expect(w.gross).toBe(1200)
    expect(w.retention).toBe(240)
    expect(w.advanceRecovered).toBe(960)
    expect(w.net).toBe(0)
    expect(w.shortfall).toBe(1040)
  })

  it("raising the day rate raises the retention with it, without anybody editing a rule", () => {
    const before = runWeek({ rules, workerId: "ravi", weekStart: "2026-08-03", days: [1], dayRate: 600 })
    const after = runWeek({ rules, workerId: "ravi", weekStart: "2026-08-03", days: [1], dayRate: 700 })
    expect(before.retention).toBe(120)
    expect(after.retention).toBe(140)
  })
})

describe("AN ESTATE THAT USES NONE OF IT — the other three tenants", () => {
  it("gross is net, and no deduction column has anything in it", () => {
    const w = runWeek({ rules: [], workerId: "anyone", weekStart: "2026-08-03", days: [1, 1, 1, 1, 1, 1], dayRate: 450 })
    expect(w.rule).toBeNull()
    expect(w.gross).toBe(2700)
    expect(w.retention).toBe(0)
    expect(w.advanceRecovered).toBe(0)
    expect(w.net).toBe(2700)
    expect(w.shortfall).toBe(0)
  })

  it("even with an advance on file, because an advance is not a rule", () => {
    // HoneyFarm could record an advance without ever setting retention. One does not imply the other.
    const w = runWeek({
      rules: [],
      workerId: "anyone",
      weekStart: "2026-08-03",
      days: [1, 1, 1],
      dayRate: 450,
      advances: [advance(500)],
    })
    expect(w.retention).toBe(0)
    expect(w.advanceRecovered).toBe(500)
    expect(w.net).toBe(850)
  })
})

describe("A DIFFERENT ESTATE — flat retention, explicit hourly overtime, mixed rates", () => {
  const rules = [
    rule({ retentionMode: "flat_per_day", retentionValue: 50, overtimeMode: "explicit_hourly", overtimeValue: 80 }),
    // One skilled hand on a higher rate, exempt from retention entirely.
    rule({ workerId: "skilled", effectiveFrom: "2026-02-01" }),
  ]

  it("holds a fixed amount regardless of what the day paid", () => {
    const low = runWeek({ rules, workerId: "a", weekStart: "2026-08-03", days: [1, 1, 1], dayRate: 400 })
    const high = runWeek({ rules, workerId: "b", weekStart: "2026-08-03", days: [1, 1, 1], dayRate: 900 })
    expect(low.retention).toBe(150)
    expect(high.retention).toBe(150)
  })

  it("pays overtime at the estate's own hourly rate, ignoring the day rate", () => {
    const w = runWeek({ rules, workerId: "a", weekStart: "2026-08-03", days: [1, 1], dayRate: 400, overtimeHours: 3 })
    expect(w.gross).toBe(800 + 240)
  })

  it("exempts the one worker who was overridden, and only them", () => {
    const exempt = runWeek({ rules, workerId: "skilled", weekStart: "2026-08-03", days: [1, 1, 1], dayRate: 900 })
    const normal = runWeek({ rules, workerId: "a", weekStart: "2026-08-03", days: [1, 1, 1], dayRate: 900 })
    expect(exempt.retention).toBe(0)
    expect(normal.retention).toBe(150)
  })
})

describe("A YEAR IN ONE WORKER'S LIFE", () => {
  /**
   * The case that decides whether the model holds: rules change, an advance is taken and partly
   * repaid in cash, and the worker leaves owing money while the estate holds more of theirs.
   */
  const rules = [
    rule({ effectiveFrom: "2026-01-01", retentionMode: "percent_of_day", retentionValue: 20 }),
    rule({ effectiveFrom: "2026-07-01", retentionMode: "percent_of_day", retentionValue: 25 }),
  ]

  it("June computes at 20% and July at 25%, forever", () => {
    const june = runWeek({ rules, workerId: "ravi", weekStart: "2026-06-15", days: [1, 1, 1, 1, 1, 1], dayRate: 600 })
    const july = runWeek({ rules, workerId: "ravi", weekStart: "2026-07-06", days: [1, 1, 1, 1, 1, 1], dayRate: 600 })
    expect(june.retention).toBe(720)
    expect(july.retention).toBe(900)
  })

  it("re-running June after the July change gives June's answer, not July's", () => {
    // The whole reason rules carry dates instead of payroll carrying a closed flag.
    const rerun = runWeek({ rules, workerId: "ravi", weekStart: "2026-06-15", days: [1, 1, 1, 1, 1, 1], dayRate: 600 })
    expect(rerun.retention).toBe(720)
  })

  it("a cash repayment reduces what is owed without touching the schedule", () => {
    const ledger: LedgerEntry[] = [
      advance(20000, 10),
      { id: "rep", entryType: "repayment", entryDate: "2026-09-01", amount: 5000 },
    ]
    expect(outstandingAdvance(ledger)).toBe(15000)
    // The instalment is still Rs 2,000 -- repaying early shortens the tail, it does not re-plan it.
    expect(instalmentDueInPeriod(ledger[0], "2026-08-24")).toBe(2000)
  })

  it("leaving: held and owed are settled against each other, and only there", () => {
    const ledger: LedgerEntry[] = [
      { id: "r1", entryType: "retention_accrual", entryDate: "2026-06-30", amount: 8000 },
      { id: "r2", entryType: "retention_accrual", entryDate: "2026-07-31", amount: 6400 },
      advance(2000),
    ]
    const held = retentionHeld(ledger)
    const owed = outstandingAdvance(ledger)
    expect(held).toBe(14400)
    expect(owed).toBe(2000)
    // Neither figure was ever shown as the other, and the settlement is the difference.
    expect(held - owed).toBe(12400)
  })

  it("and the payout leaves nothing held", () => {
    const ledger: LedgerEntry[] = [
      { id: "r1", entryType: "retention_accrual", entryDate: "2026-06-30", amount: 14400 },
      { id: "p", entryType: "retention_payout", entryDate: "2026-08-31", amount: 14400 },
    ]
    expect(retentionHeld(ledger)).toBe(0)
  })
})

describe("the ways an estate can hurt itself, and what happens", () => {
  it("two advances at once are both tracked and both recovered", () => {
    const rules = [rule({ retentionMode: "percent_of_day", retentionValue: 20 })]
    const two = [advance(2000, 1, "a1"), advance(3000, 1, "a2")]
    expect(outstandingAdvance(two)).toBe(5000)
    const w = runWeek({ rules, workerId: "ravi", weekStart: "2026-08-03", days: [1, 1, 1, 1, 1, 1], dayRate: 600, advances: two })
    expect(w.advanceRecovered).toBe(2880)
    expect(w.shortfall).toBe(2120)
    expect(w.net).toBe(0)
  })

  it("a rule set to zero holds nothing, rather than being treated as unset", () => {
    // 0% is a decision. It must not fall back to a default or to the estate rule.
    const rules = [
      rule({ retentionMode: "percent_of_day", retentionValue: 20 }),
      rule({ workerId: "ravi", effectiveFrom: "2026-05-01", retentionMode: "percent_of_day", retentionValue: 0 }),
    ]
    expect(runWeek({ rules, workerId: "ravi", weekStart: "2026-08-03", days: [1], dayRate: 600 }).retention).toBe(0)
    expect(runWeek({ rules, workerId: "other", weekStart: "2026-08-03", days: [1], dayRate: 600 }).retention).toBe(120)
  })

  it("a worker with no days worked gets nothing and owes nothing more", () => {
    const rules = [rule({ retentionMode: "percent_of_day", retentionValue: 20 })]
    const w = runWeek({ rules, workerId: "ravi", weekStart: "2026-08-03", days: [], dayRate: 600, advances: [advance(2000)] })
    expect(w.gross).toBe(0)
    expect(w.net).toBe(0)
    expect(w.advanceRecovered).toBe(0)
    // Nothing was recovered, and the debt is untouched rather than quietly written down.
    expect(w.shortfall).toBe(2000)
  })
})

describe("MEDAPPA AS MANOJ ACTUALLY STATED IT, 2026-09-08", () => {
  /**
   * His answers, verbatim, turned into the rule row scripts/dev/seed-payroll-demo.mjs writes:
   *
   *   "Retention percentage remains at 20% of the daily rate irrespective of the wage increases"
   *   "if some one works half a day it is 20% of the applicable half day wage"
   *   "my normal work is 8 hours"
   *   "don't tie the OT to the number of hours worked during the day. let it be a separate entry
   *    at a muster level ... against the name of the worker"
   *   "all workers are on daily wages and are paid weekly on a Saturday"
   *   "every daily rate worker will get the deductions"
   *
   * Pinned here so a later edit to a default cannot quietly change what his estate is paid.
   */
  const medappa = rule({
    effectiveFrom: "2026-04-01",
    retentionMode: "percent_of_day",
    retentionValue: 20,
    overtimeMode: "multiplier_of_hourly",
    overtimeValue: 1.2,
    fullDayHours: 8,
  })

  it("holds 20% of a Rs 600 day", () => {
    expect(retentionForDay(medappa, 600, 1)).toBe(120)
  })

  it("holds 20% of the HALF-DAY wage on a half day — his words", () => {
    // Rs 300 earned, Rs 60 held. Not Rs 120, and not Rs 600 x 20% x anything else.
    expect(retentionForDay(medappa, 600, 0.5)).toBe(60)
  })

  it("keeps the PERCENTAGE fixed across a wage rise, so the rupees move", () => {
    // "remains at 20% ... irrespective of the wage increases" -- the 20 is what is constant.
    expect(retentionForDay(medappa, 700, 1)).toBe(140)
    expect(retentionForDay(medappa, 800, 1)).toBe(160)
  })

  it("pays overtime at Rs 90 an hour: Rs 600 over an EIGHT hour day, times 1.2", () => {
    expect(overtimePay(medappa, { dayRate: 600, hours: 1 })).toBe(90)
    expect(overtimePay(medappa, { dayRate: 600, hours: 3 })).toBe(270)
  })

  it("does NOT use the six-hour attendance threshold as the pay divisor", () => {
    // lib/attendance-hours.ts's DEFAULT_FULL_DAY_HOURS is 6 and decides whether a PUNCH PAIR counts
    // as a full day. Only HoneyFarm has a terminal; Medappa's 787 attendance rows carry zero punch
    // times. Using 6 here would price overtime at Rs 120/hour instead of Rs 90 -- a third too high
    // on every payment, from a number belonging to a different estate's hardware.
    expect(overtimePay(medappa, { dayRate: 600, hours: 1 })).not.toBe(120)
  })

  it("a full week with three hours of overtime", () => {
    const w = runWeek({
      rules: [medappa],
      workerId: "ravi",
      weekStart: "2026-08-03",
      days: [1, 1, 1, 1, 1, 1],
      dayRate: 600,
      overtimeHours: 3,
    })
    expect(w.gross).toBe(3870) // 3600 + 270
    // Retention follows the days worked, not the overtime -- the extra hours are pay, not a day.
    expect(w.retention).toBe(720)
    expect(w.net).toBe(3150)
  })

  it("every daily-rate worker is covered, with no exemptions to configure", () => {
    // "every daily rate worker will get the deductions" -- the estate-wide default with no
    // overrides is exactly that, and it costs one row rather than twenty-nine.
    for (const worker of ["ravi", "suma", "ganesh", "anyone-at-all"]) {
      expect(resolveRuleForDate([medappa], worker, "2026-08-03")?.retentionValue).toBe(20)
    }
  })
})
