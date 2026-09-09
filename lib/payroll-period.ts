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
} from "@/lib/pay-rules"

/**
 * One payroll period, turned from raw rows into what a worker is handed.
 *
 * This is the join between the database and lib/pay-rules.ts. It lives outside the route so the
 * whole gross → deductions → net path can be tested without a database, which is the only way the
 * arithmetic on somebody's wage sheet gets checked at all.
 *
 * IT IS APPLIED IN JAVASCRIPT ON PURPOSE. Resolving an effective-dated rule and pricing overtime
 * could be done in SQL, and doing so would mean two implementations of the same rules in two
 * languages that must agree forever. This product has been bitten by exactly that: labour_cost
 * unions two write paths, lib/rainfall.ts exists because nine consumers each summed gauges their
 * own way. One implementation, already tested, called from here.
 */

export type WorkedDay = {
  workerId: string
  workDate: string
  /** Share of a day, summed across every job on that date. */
  dayFraction: number
  /** The rate stored on the row, not the worker's current one — see labour_assignments.rate. */
  rate: number
}

export type OvertimeDay = {
  workerId: string
  workDate: string
  hours: number
}

export type PeriodInput = {
  rules: readonly PayRule[]
  workedDays: readonly WorkedDay[]
  overtimeDays: readonly OvertimeDay[]
  /** Every ledger entry for the worker, all time — balances need history, not just this period. */
  ledger: readonly (LedgerEntry & { workerId: string })[]
  /**
   * Which payroll run this is, counted from the first. Advances recover across runs, so an
   * instalment needs to know which one it is looking at.
   *
   * Manoj pays weekly on a Saturday and wants deductions taken weekly, so for Medappa a period is
   * a week. The unit is deliberately "a payroll run" rather than a month — see scripts/149.
   */
  periodIndex: number
}

export type WorkerPay = {
  workerId: string
  retention: number
  overtime: number
  advanceDue: number
  advanceRecovered: number
  shortfall: number
  /** Balances as they stand after this run. */
  heldAfter: number
  owedAfter: number
  /** Whether any rule applied at all — drives whether a column is shown. */
  hasRule: boolean
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Retention, overtime and advance recovery for one worker over one period.
 *
 * Retention is computed DAY BY DAY, not from the period total, because the rule in force can change
 * mid-period and because a half day must retain half. Summing the period first and applying one
 * percentage would be right only while nothing ever changes, which is the assumption that makes
 * payroll bugs invisible until somebody's rate moves.
 */
export function computeWorkerPay(input: PeriodInput, workerId: string, gross: number): WorkerPay {
  const days = input.workedDays.filter((d) => d.workerId === workerId)
  const ot = input.overtimeDays.filter((d) => d.workerId === workerId)
  const entries = input.ledger.filter((e) => e.workerId === workerId)

  let retention = 0
  let hasRule = false
  for (const day of days) {
    const rule = resolveRuleForDate(input.rules, workerId, day.workDate)
    if (rule?.retentionMode) hasRule = true
    retention += retentionForDay(rule, day.rate, day.dayFraction)
  }

  // Overtime is priced by the rule in force on the day it was worked, and by that day's rate --
  // not the worker's current one, for the same reason retention uses the stored rate.
  let overtime = 0
  for (const day of ot) {
    const rule = resolveRuleForDate(input.rules, workerId, day.workDate)
    if (rule?.overtimeMode) hasRule = true
    const rateThatDay =
      days.find((d) => d.workDate === day.workDate)?.rate ??
      days[0]?.rate ??
      0
    overtime += overtimePay(rule, { dayRate: rateThatDay, hours: day.hours })
  }

  const advanceDue = entries.reduce((sum, e) => sum + instalmentDueInPeriod(e, input.periodIndex), 0)

  // Overtime is earnings, so it is deducted FROM -- an estate that pays overtime and then holds
  // nothing against it would be retaining a smaller share than the rule says.
  const applied = applyDeductions({ gross: gross + overtime, retention, advanceDue })

  return {
    workerId,
    retention: applied.retention,
    overtime: round(overtime),
    advanceDue: round(advanceDue),
    advanceRecovered: applied.advanceRecovered,
    shortfall: applied.shortfall,
    heldAfter: round(retentionHeld(entries) + applied.retention),
    owedAfter: round(Math.max(0, outstandingAdvance(entries, 0) - applied.advanceRecovered)),
    hasRule,
  }
}

/**
 * Whether this tenant uses any of it — which decides whether a column appears at all.
 *
 * THE GUARANTEE THIS ENFORCES: an estate that sets no rules and records no ledger entries sees the
 * payroll it saw before any of this existed. Three of four live tenants are in that state, and
 * tests/payroll-scenarios.test.ts asserts gross equals net for them.
 */
export function periodUsesRules(input: Pick<PeriodInput, "rules" | "ledger" | "overtimeDays">): boolean {
  return (
    input.rules.some((r) => r.retentionMode != null || r.overtimeMode != null) ||
    input.ledger.length > 0 ||
    input.overtimeDays.length > 0
  )
}

/**
 * Saturday is payday at Medappa, so a week runs Sunday to Saturday there.
 *
 * Exported rather than assumed because Monday-start is the other common convention and this is a
 * per-estate fact, not a universal one. `weekEndsOn` is 0=Sunday … 6=Saturday.
 */
export function weekRangeFor(date: string, weekEndsOn = 6): { start: string; end: string } {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay()
  const daysToEnd = (weekEndsOn - day + 7) % 7
  const end = new Date(d)
  end.setUTCDate(d.getUTCDate() + daysToEnd)
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - 6)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/**
 * How many payroll runs have elapsed between the first one and this one.
 *
 * Advances recover per run, so an instalment needs an ordinal. Derived from the advance's own start
 * rather than stored, so re-running a closed week gives the same instalment it gave the first time.
 */
export function periodIndexFor(firstPeriodStart: string, thisPeriodStart: string, periodDays = 7): number {
  const a = Date.parse(`${firstPeriodStart}T00:00:00Z`)
  const b = Date.parse(`${thisPeriodStart}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || periodDays <= 0) return 0
  return Math.max(0, Math.floor((b - a) / (periodDays * 86400000)))
}
