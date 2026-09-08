import { describe, expect, it } from "vitest"

import {
  applyDeductions,
  instalmentAmount,
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
 * Every reading of what Medappa described, tested — because the answers had not arrived when this
 * was written and the next estate will answer differently.
 *
 * The numbers are their real ones: 29 workers, all Rs 600 a day, paid weekly.
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

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: "e1",
  entryType: "advance",
  entryDate: "2026-08-12",
  amount: 2000,
  recoverOverPeriods: 1,
  recoverFrom: null,
  ...over,
})

describe("an estate with no rules is untouched", () => {
  it("holds nothing and pays no overtime", () => {
    // Three of four live tenants have no rules at all. If this ever fails they have been given a
    // payroll they did not ask for.
    expect(retentionForDay(null, 600, 1)).toBe(0)
    expect(overtimePay(null, { dayRate: 600, hours: 4 })).toBe(0)
    expect(resolveRuleForDate([], "w1", "2026-08-01")).toBeNull()
  })

  it("a rule with a mode but no number does nothing", () => {
    expect(retentionForDay(rule({ retentionMode: "percent_of_day" }), 600, 1)).toBe(0)
  })
})

describe("the rule in force is the one that was in force then", () => {
  const rules = [
    rule({ effectiveFrom: "2026-01-01", retentionMode: "percent_of_day", retentionValue: 20 }),
    rule({ effectiveFrom: "2026-06-01", retentionMode: "percent_of_day", retentionValue: 25 }),
  ]

  it("picks the newest rule on or before the work date", () => {
    expect(resolveRuleForDate(rules, "w1", "2026-05-31")?.retentionValue).toBe(20)
    expect(resolveRuleForDate(rules, "w1", "2026-06-01")?.retentionValue).toBe(25)
  })

  it("ignores a rule that had not started yet", () => {
    // The whole point of effective dating: raising the rate in June must not rewrite May.
    expect(resolveRuleForDate(rules, "w1", "2026-03-15")?.retentionValue).toBe(20)
  })

  it("returns nothing before the first rule exists", () => {
    expect(resolveRuleForDate(rules, "w1", "2025-12-31")).toBeNull()
  })

  it("a worker override beats the estate default even when the default is newer", () => {
    // An estate that moves everyone to 25% in June must not drag along the one person deliberately
    // put on 10% in February. To move them back, write them another override.
    const withOverride = [
      ...rules,
      rule({ workerId: "w1", effectiveFrom: "2026-02-01", retentionMode: "percent_of_day", retentionValue: 10 }),
    ]
    expect(resolveRuleForDate(withOverride, "w1", "2026-08-01")?.retentionValue).toBe(10)
    expect(resolveRuleForDate(withOverride, "w2", "2026-08-01")?.retentionValue).toBe(25)
  })

  it("an all-null override switches a worker's rules off without deleting history", () => {
    const withStop = [
      ...rules,
      rule({ workerId: "w1", effectiveFrom: "2026-07-01" }),
    ]
    const resolved = resolveRuleForDate(withStop, "w1", "2026-08-01")
    expect(resolved).not.toBeNull()
    expect(retentionForDay(resolved, 600, 1)).toBe(0)
    // …and June, before it stopped, still holds.
    expect(retentionForDay(resolveRuleForDate(withStop, "w1", "2026-06-15"), 600, 1)).toBe(150)
  })
})

describe("retention: both readings of twenty percent", () => {
  const pct = rule({ retentionMode: "percent_of_day", retentionValue: 20 })
  const flat = rule({ retentionMode: "flat_per_day", retentionValue: 120 })

  it("agree on Medappa's flat Rs 600 roster", () => {
    expect(retentionForDay(pct, 600, 1)).toBe(120)
    expect(retentionForDay(flat, 600, 1)).toBe(120)
  })

  it("and diverge the moment a rate moves — which is the whole question", () => {
    expect(retentionForDay(pct, 700, 1)).toBe(140)
    expect(retentionForDay(flat, 700, 1)).toBe(120)
  })

  it("a half day holds half, under both", () => {
    // The percent case prorates inherently. The flat case is an ASSUMPTION pending Manoj's answer;
    // if he says a half day charges the full flat amount it is one `* share` in retentionForDay.
    expect(retentionForDay(pct, 600, 0.5)).toBe(60)
    expect(retentionForDay(flat, 600, 0.5)).toBe(60)
  })

  it("holds nothing on a day nobody worked", () => {
    expect(retentionForDay(pct, 600, 0)).toBe(0)
  })
})

describe("overtime: the three readings differ by 3x", () => {
  it("hourly derived from the day", () => {
    // Rs 600 / 6h = Rs 100/h, x1.2 = Rs 120/h, x 2h = Rs 240.
    const r = rule({ overtimeMode: "multiplier_of_hourly", overtimeValue: 1.2 })
    expect(overtimePay(r, { dayRate: 600, hours: 2 })).toBe(240)
  })

  it("and the length of a working day changes it by a third", () => {
    // Not cosmetic: this is every overtime payment the estate will ever make.
    const six = rule({ overtimeMode: "multiplier_of_hourly", overtimeValue: 1.2, fullDayHours: 6 })
    const eight = rule({ overtimeMode: "multiplier_of_hourly", overtimeValue: 1.2, fullDayHours: 8 })
    expect(overtimePay(six, { dayRate: 600, hours: 2 })).toBe(240)
    expect(overtimePay(eight, { dayRate: 600, hours: 2 })).toBe(180)
  })

  it("a whole-day uplift pays the EXTRA only, never the day twice", () => {
    // The day's own wage is already on the assignment. Returning 1.2x here would pay 2.2 days.
    const r = rule({ overtimeMode: "multiplier_of_day", overtimeValue: 1.2 })
    expect(overtimePay(r, { dayRate: 600, hours: 2 })).toBe(120)
  })

  it("a whole-day uplift ignores hours, because it is not per-hour", () => {
    const r = rule({ overtimeMode: "multiplier_of_day", overtimeValue: 1.2 })
    expect(overtimePay(r, { dayRate: 600, hours: 0 })).toBe(120)
    expect(overtimePay(r, { dayRate: 600, hours: 9 })).toBe(120)
  })

  it("a whole-day uplift on a half day is half the uplift", () => {
    const r = rule({ overtimeMode: "multiplier_of_day", overtimeValue: 1.2 })
    expect(overtimePay(r, { dayRate: 600, hours: 0, dayFraction: 0.5 })).toBe(60)
  })

  it("an explicit hourly rate ignores the daily rate entirely", () => {
    const r = rule({ overtimeMode: "explicit_hourly", overtimeValue: 90 })
    expect(overtimePay(r, { dayRate: 600, hours: 2 })).toBe(180)
    expect(overtimePay(r, { dayRate: 1200, hours: 2 })).toBe(180)
  })

  it("pays nothing for zero hours under the per-hour modes", () => {
    expect(overtimePay(rule({ overtimeMode: "multiplier_of_hourly", overtimeValue: 1.2 }), { dayRate: 600, hours: 0 })).toBe(0)
    expect(overtimePay(rule({ overtimeMode: "explicit_hourly", overtimeValue: 90 }), { dayRate: 600, hours: 0 })).toBe(0)
  })

  it("refuses a multiplier below 1 rather than docking pay", () => {
    const r = rule({ overtimeMode: "multiplier_of_day", overtimeValue: 0.8 })
    expect(overtimePay(r, { dayRate: 600, hours: 0 })).toBe(0)
  })
})

describe("an advance recovers itself and then stops", () => {
  it("comes off in full in its own period by default", () => {
    const e = entry({ amount: 2000, recoverOverPeriods: 1 })
    expect(instalmentDueInPeriod(e, 0)).toBe(2000)
  })

  it("and is not deducted again the period after — with nothing to tick", () => {
    // THE QUESTION THIS WHOLE DESIGN ANSWERS. No settlement flag: forgetting one deducts the same
    // advance twice, silently, on a person's wages.
    const e = entry({ amount: 2000, recoverOverPeriods: 1 })
    expect(instalmentDueInPeriod(e, 1)).toBe(0)
    expect(instalmentDueInPeriod(e, 12)).toBe(0)
  })

  it("splits evenly across the instalments asked for", () => {
    const e = entry({ amount: 20000, recoverOverPeriods: 10 })
    expect(instalmentAmount(e)).toBe(2000)
    expect(instalmentDueInPeriod(e, 0)).toBe(2000)
    expect(instalmentDueInPeriod(e, 9)).toBe(2000)
    expect(instalmentDueInPeriod(e, 10)).toBe(0)
  })

  it("never recovers against a repayment or a retention row", () => {
    expect(instalmentDueInPeriod(entry({ entryType: "repayment" }), 0)).toBe(0)
    expect(instalmentDueInPeriod(entry({ entryType: "retention_accrual" }), 0)).toBe(0)
  })

  it("treats a missing or nonsense schedule as one instalment", () => {
    expect(instalmentDueInPeriod(entry({ recoverOverPeriods: null, amount: 500 }), 0)).toBe(500)
    expect(instalmentDueInPeriod(entry({ recoverOverPeriods: 0, amount: 500 }), 0)).toBe(500)
  })
})

describe("what a worker owes, and what is held for them", () => {
  it("counts two advances separately but reports one total", () => {
    const entries = [
      entry({ id: "a", amount: 2000 }),
      entry({ id: "b", amount: 3000, entryDate: "2026-08-20" }),
    ]
    expect(outstandingAdvance(entries, 0)).toBe(5000)
  })

  it("a cash repayment reduces it, without any flag", () => {
    const entries = [entry({ id: "a", amount: 2000 }), entry({ id: "r", entryType: "repayment", amount: 1000 })]
    expect(outstandingAdvance(entries, 0)).toBe(1000)
  })

  it("never goes negative when more is repaid than was taken", () => {
    const entries = [entry({ id: "a", amount: 1000 }), entry({ id: "r", entryType: "repayment", amount: 1500 })]
    expect(outstandingAdvance(entries, 0)).toBe(0)
  })

  it("held retention grows on accrual and falls on payout", () => {
    const entries = [
      entry({ id: "1", entryType: "retention_accrual", amount: 2640 }),
      entry({ id: "2", entryType: "retention_accrual", amount: 2880 }),
      entry({ id: "3", entryType: "retention_payout", amount: 1000 }),
    ]
    expect(retentionHeld(entries)).toBe(4520)
  })

  it("held and owed are separate figures, never netted", () => {
    // A worker can hold Rs 14,400 of their own money AND owe Rs 2,000. Netting to Rs 12,400 hides
    // both facts and gets the exit settlement wrong.
    const entries = [
      entry({ id: "1", entryType: "retention_accrual", amount: 14400 }),
      entry({ id: "2", entryType: "advance", amount: 2000 }),
    ]
    expect(retentionHeld(entries)).toBe(14400)
    expect(outstandingAdvance(entries, 0)).toBe(2000)
  })
})

describe("a thin week cannot produce a negative wage", () => {
  it("pays the ordinary case straight through", () => {
    const r = applyDeductions({ gross: 13200, retention: 2640, advanceDue: 2000 })
    expect(r.net).toBe(8560)
    expect(r.shortfall).toBe(0)
  })

  it("caps recovery at the wage and reports what it could not take", () => {
    // Rs 10,000 advance against 8 days' work. Net stops at zero; the rest is STATED, not carried
    // silently into next month.
    const r = applyDeductions({ gross: 4800, retention: 960, advanceDue: 10000 })
    expect(r.net).toBe(0)
    expect(r.advanceRecovered).toBe(3840)
    expect(r.shortfall).toBe(6160)
  })

  it("protects retention ahead of advance recovery", () => {
    // Retention is the worker's own money being held; the instalment is what gives way.
    const r = applyDeductions({ gross: 1000, retention: 200, advanceDue: 5000 })
    expect(r.retention).toBe(200)
    expect(r.advanceRecovered).toBe(800)
    expect(r.net).toBe(0)
  })

  it("caps retention itself at the wage when the rule is larger than the pay", () => {
    const r = applyDeductions({ gross: 300, retention: 500, advanceDue: 0 })
    expect(r.retention).toBe(300)
    expect(r.net).toBe(0)
  })

  it("takes other deductions before an advance instalment", () => {
    const r = applyDeductions({ gross: 5000, retention: 1000, advanceDue: 5000, otherDeductions: 500 })
    expect(r.otherDeductions).toBe(500)
    expect(r.advanceRecovered).toBe(3500)
    expect(r.net).toBe(0)
    expect(r.shortfall).toBe(1500)
  })
})
