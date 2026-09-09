import { DEFAULT_FULL_DAY_HOURS } from "@/lib/attendance-hours"

/**
 * The arithmetic an estate's own rules produce. Pure, so it can be tested against every reading
 * that was described on the call rather than the one that happened to get built.
 *
 * Storage is scripts/149; the reasoning is docs/PAYROLL-RULES-PLAN.md and
 * docs/MEDAPPA-PAYROLL-PROPOSAL.md. Nothing here knows a tenant's name.
 *
 * TWO THINGS THIS FILE EXISTS TO GET RIGHT:
 *
 *   1. Overtime is the EXTRA, never the whole. The normal day is already paid by the assignment's
 *      own rate x day_fraction. An overtime figure that includes the base pays the morning twice.
 *   2. A rule applies as of a DATE. Resolution always takes the rule in force on the work date,
 *      never "the current rule", so re-running a closed month cannot change what it cost.
 */

export type RetentionMode = "percent_of_day" | "flat_per_day"
export type OvertimeMode = "multiplier_of_hourly" | "multiplier_of_day" | "explicit_hourly"

export type PayRule = {
  /** null = the estate-wide default; a value = an override for that worker alone. */
  workerId: string | null
  effectiveFrom: string
  retentionMode: RetentionMode | null
  retentionValue: number | null
  overtimeMode: OvertimeMode | null
  overtimeValue: number | null
  fullDayHours: number | null
  pfPercent: number | null
}

const num = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Money is rounded to the paisa here and to the rupee at the edge — see lib/format.ts. */
const money = (value: number): number => (Number.isFinite(value) ? Math.round(value * 100) / 100 : 0)

/**
 * The rule in force for a worker on a date.
 *
 * A WORKER OVERRIDE BEATS THE ESTATE DEFAULT REGARDLESS OF WHICH IS NEWER. That is the point of an
 * override: an estate that sets 20% for everyone in January and 25% for everyone in June must not
 * silently drag along the one worker who was deliberately put on 10% in February. To move that
 * worker back onto the default, write them a new override -- or an all-null row, which is how a
 * rule is switched off without deleting history.
 */
export function resolveRuleForDate(
  rules: readonly PayRule[],
  workerId: string,
  workDate: string,
): PayRule | null {
  const inForce = (r: PayRule) => r.effectiveFrom <= workDate
  const newest = (a: PayRule, b: PayRule) => (a.effectiveFrom >= b.effectiveFrom ? a : b)

  const forWorker = rules.filter((r) => r.workerId === workerId && inForce(r))
  if (forWorker.length > 0) return forWorker.reduce(newest)

  const defaults = rules.filter((r) => r.workerId === null && inForce(r))
  if (defaults.length > 0) return defaults.reduce(newest)

  return null
}

/**
 * What one day's work holds back.
 *
 * `dayFraction` is the muster's own share of a day (1, 0.5, …), so a half day retains half under
 * BOTH modes.
 *
 * ⚠ THE FLAT CASE IS AN ASSUMPTION, NOT AN ANSWER. "Rs 100 per day worked" on a half day could
 * defensibly be Rs 50 (this) or Rs 100 (a flat charge for turning up). Manoj has been asked which;
 * until he replies this prorates, because it is the reading consistent with percent_of_day, with
 * the day cap, and with every other per-day figure in the product. If the answer is the other one,
 * it is the single `* dayFraction` below.
 */
export function retentionForDay(rule: PayRule | null, dayRate: number, dayFraction: number): number {
  if (!rule?.retentionMode || rule.retentionValue == null) return 0

  const share = Math.max(0, num(dayFraction))
  const value = Math.max(0, num(rule.retentionValue))
  if (share <= 0 || value <= 0) return 0

  if (rule.retentionMode === "percent_of_day") {
    return money(Math.max(0, num(dayRate)) * share * (value / 100))
  }
  return money(value * share)
}

/**
 * What overtime adds, on top of a day that is already paid.
 *
 * The three readings of "1.2x the daily rate" differ by 3x on the same input, which is why the mode
 * is stored rather than assumed:
 *
 *   multiplier_of_hourly  Rs 600 / 6h = Rs 100/h, x1.2 = Rs 120/h, x2h  = Rs 240
 *   multiplier_of_day     Rs 600 x (1.2 - 1)                           = Rs 120   (hours ignored)
 *   explicit_hourly       Rs 90/h x 2h                                 = Rs 180
 *
 * multiplier_of_day subtracts 1 deliberately. The day's own wage is already in the assignment;
 * returning the full 1.2x here would pay 2.2 days for one. It also ignores `hours` entirely,
 * because that mode means "this whole day is worth more", not "these hours are extra" -- it is what
 * labour_assignments.pay_multiplier has always done for holiday pay.
 */
export function overtimePay(
  rule: PayRule | null,
  input: { dayRate: number; hours: number; dayFraction?: number },
): number {
  if (!rule?.overtimeMode || rule.overtimeValue == null) return 0

  const dayRate = Math.max(0, num(input.dayRate))
  const hours = Math.max(0, num(input.hours))
  const value = Math.max(0, num(rule.overtimeValue))
  if (value <= 0) return 0

  if (rule.overtimeMode === "multiplier_of_day") {
    // Not per-hour. A multiplier below 1 would mean a penalty, which nobody has asked for.
    if (value <= 1) return 0
    const share = input.dayFraction == null ? 1 : Math.max(0, num(input.dayFraction))
    return money(dayRate * (value - 1) * share)
  }

  if (hours <= 0) return 0

  if (rule.overtimeMode === "explicit_hourly") return money(value * hours)

  // multiplier_of_hourly. The length of a full day decides the hourly rate, and getting it wrong is
  // not cosmetic: Rs 600 over 6 hours is Rs 100/h and over 8 is Rs 75 -- a third less, on every
  // overtime payment ever made. The estate can state it; the app default is the fallback.
  const fullDay = num(rule.fullDayHours) > 0 ? num(rule.fullDayHours) : DEFAULT_FULL_DAY_HOURS
  if (fullDay <= 0) return 0
  return money((dayRate / fullDay) * value * hours)
}

// ---------------------------------------------------------------------------
// Advances
// ---------------------------------------------------------------------------

export type LedgerEntry = {
  id: string
  entryType: "advance" | "deduction" | "adjustment" | "repayment" | "retention_accrual" | "retention_payout"
  entryDate: string
  amount: number
  recoverOverPeriods?: number | null
  recoverFrom?: string | null
}

/**
 * One instalment of an advance.
 *
 * ⚠ "PERIOD" MEANS A PAYROLL RUN, NOT A CALENDAR MONTH. Medappa described "Rs 20,000 recovered over
 * ten months" while paying weekly, and those are not the same unit -- ten monthly instalments is
 * roughly forty weekly ones. Manoj has been asked whether the deduction should land on one week a
 * month or spread across every week. Until he answers, this file counts payroll runs, which is what
 * the column name says and the only unit that is well-defined for an arbitrary date range.
 */
export function instalmentAmount(entry: LedgerEntry): number {
  const periods = Math.max(1, Math.floor(num(entry.recoverOverPeriods) || 1))
  return money(Math.max(0, num(entry.amount)) / periods)
}

/**
 * Which instalment, if any, a period owes for an advance.
 *
 * ANCHORED TO THE ADVANCE'S OWN START, NOT TO A GLOBAL COUNTER. This took a period ordinal supplied
 * by the caller and only checked it against the instalment count -- so an advance handed over on the
 * 10th was recovered from the week of the 2nd, a week that had already been paid before the money
 * existed. Every advance began recovering from whatever the caller happened to call period 0.
 *
 * Found by tests/payroll-month-report.test.ts on its first run, which is the argument for
 * simulating a whole month rather than testing one week: a single period cannot tell a global
 * ordinal from a relative one, because in a single period they are the same number.
 *
 * Returns 0 before the advance starts and 0 after its instalments are done, so an advance applies
 * to exactly the runs it should and stops without anybody closing it.
 */
export function instalmentDueInPeriod(entry: LedgerEntry, periodStart: string, periodDays = 7): number {
  if (entry.entryType !== "advance") return 0
  const periods = Math.max(1, Math.floor(num(entry.recoverOverPeriods) || 1))

  // recover_from wins when set; otherwise recovery starts from the period the advance falls in.
  const from = Date.parse(`${entry.recoverFrom || entry.entryDate}T00:00:00Z`)
  const here = Date.parse(`${periodStart}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(here) || periodDays <= 0) return 0

  // CEIL, NOT FLOOR. A run whose start is before the advance but whose end is after it -- money
  // handed over on Wednesday, wages paid that Saturday -- is that advance's FIRST instalment, and
  // floor pushed it to the following week. The comment here said Wednesday-to-Saturday all along
  // while the arithmetic did the opposite; the month simulation is what showed the two disagreeing.
  //
  //   from Wed 12th, run starts Sun 9th   ceil(-3/7)  =  0   → recovered this Saturday ✓
  //   from Wed 12th, run starts Sun 16th  ceil( 4/7)  =  1   → second instalment ✓
  //   from Wed 12th, run starts Sun 2nd   ceil(-10/7) = -1   → before it existed, nothing ✓
  const index = Math.ceil((here - from) / (periodDays * 86400000))
  if (index < 0 || index >= periods) return 0
  return instalmentAmount(entry)
}

/**
 * How much of an advance has been recovered by the end of a given period. Derived, never stored.
 */
export function recoveredByPeriod(entry: LedgerEntry, periodStart: string, periodDays = 7): number {
  if (entry.entryType !== "advance") return 0
  const periods = Math.max(1, Math.floor(num(entry.recoverOverPeriods) || 1))
  const from = Date.parse(`${entry.recoverFrom || entry.entryDate}T00:00:00Z`)
  const here = Date.parse(`${periodStart}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(here) || periodDays <= 0) return 0
  const elapsed = Math.ceil((here - from) / (periodDays * 86400000)) + 1
  const taken = Math.min(Math.max(0, elapsed), periods)
  return money(instalmentAmount(entry) * taken)
}

/**
 * What a worker still owes: advances, less what has been recovered, less anything repaid in cash.
 *
 * Derived from the entries every time. A stored balance is a number that drifts from the rows
 * behind it, and the only thing worse than not knowing what somebody owes is confidently showing
 * the wrong figure.
 */
export function outstandingAdvance(
  entries: readonly LedgerEntry[],
  /**
   * The period to measure as of. Omit for "everything advanced, less cash repaid" -- the cautious
   * figure the Workers panel shows before payroll has run.
   *
   * Passing it makes recovery CUMULATIVE. It used to take a single `recoveredToDate` number that
   * callers had no way to compute, so every one of them passed 0 and the balance never fell as
   * instalments came off. A worker four weeks into a ten-week advance still showed the full amount.
   */
  asOfPeriodStart?: string,
  periodDays = 7,
): number {
  const advanced = entries
    .filter((e) => e.entryType === "advance")
    .reduce((sum, e) => sum + Math.max(0, num(e.amount)), 0)
  const repaid = entries
    .filter((e) => e.entryType === "repayment")
    .reduce((sum, e) => sum + Math.max(0, num(e.amount)), 0)
  const recovered = asOfPeriodStart
    ? entries.reduce((sum, e) => sum + recoveredByPeriod(e, asOfPeriodStart, periodDays), 0)
    : 0
  return money(Math.max(0, advanced - repaid - recovered))
}

/** Retention held for a worker: accruals in, payouts out. Grows until they leave. */
export function retentionHeld(entries: readonly LedgerEntry[]): number {
  const accrued = entries
    .filter((e) => e.entryType === "retention_accrual")
    .reduce((sum, e) => sum + Math.max(0, num(e.amount)), 0)
  const paid = entries
    .filter((e) => e.entryType === "retention_payout")
    .reduce((sum, e) => sum + Math.max(0, num(e.amount)), 0)
  return money(Math.max(0, accrued - paid))
}

/**
 * Deductions capped at what there is to deduct from.
 *
 * Net never goes negative, and the shortfall is RETURNED rather than carried. A wage sheet that
 * quietly moves money into next month is worse than one that says it could not recover the rest --
 * the estate has to decide that, not the software.
 *
 * Retention comes out before advance recovery on purpose: retention is the worker's own money being
 * held, so it survives a thin week; an advance instalment is what gives way.
 */
export function applyDeductions(input: {
  gross: number
  retention: number
  advanceDue: number
  otherDeductions?: number
}): { retention: number; advanceRecovered: number; otherDeductions: number; net: number; shortfall: number } {
  const gross = Math.max(0, num(input.gross))
  const retention = Math.min(Math.max(0, num(input.retention)), gross)

  let remaining = gross - retention
  const other = Math.min(Math.max(0, num(input.otherDeductions)), remaining)
  remaining -= other

  const advanceDue = Math.max(0, num(input.advanceDue))
  const advanceRecovered = Math.min(advanceDue, remaining)
  remaining -= advanceRecovered

  return {
    retention: money(retention),
    advanceRecovered: money(advanceRecovered),
    otherDeductions: money(other),
    net: money(remaining),
    shortfall: money(advanceDue - advanceRecovered),
  }
}
