import {
  applyDeductions,
  instalmentsDueInRange,
  outstandingAdvance,
  overtimePay,
  recoveredBeforeDate,
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
   * The first day of this payroll run.
   *
   * A DATE, NOT AN ORDINAL. This was an index counted from "the first run", which every caller had
   * to invent — and an advance handed over on the 10th was then recovered from the week starting
   * the 2nd, because index 0 meant "the caller's first period" rather than "this advance's first
   * period". A week already paid, docked for money not yet given.
   *
   * Anchoring to the advance's own start makes recovering-before-lending impossible rather than
   * merely unlikely. Found by tests/payroll-month-report.test.ts on its first run: a single week
   * cannot tell a global ordinal from a relative one, because over one period they are the same
   * number. A month can.
   *
   * Manoj pays weekly on a Saturday and takes deductions weekly, so for Medappa a period is a week
   * — hence periodDays. The unit is a payroll run, never a calendar month.
   */
  periodStart: string
  /**
   * The last day of the range being computed.
   *
   * A RANGE IS NOT ALWAYS ONE RUN, and pretending otherwise cost real money. The screen opens on
   * month-to-date and its date boxes accept anything, while the run length below was left at its
   * default of 7 by every caller -- so August took a single weekly instalment for a month's work,
   * and then reported the worker still owing the three instalments it had skipped. The comment on
   * the screen even said an arbitrary range would do this; nothing acted on it.
   *
   * Given, the range recovers every instalment falling inside it, so a month agrees with the four
   * weekly runs it contains. Omitted, it is derived as one run from periodStart, which is what every
   * existing caller and test means.
   */
  periodEnd?: string
  /** Length of a payroll RUN in days — 7 for a weekly payroll. Not the length of the range. */
  periodDays?: number
}

export type WorkerPay = {
  workerId: string
  retention: number
  overtime: number
  advanceDue: number
  advanceRecovered: number
  shortfall: number
  /** One-off amounts withheld — a fine, damage — capped at what there was to withhold from. */
  otherDeductions: number
  /** The part of a fine the wage could not cover. Stated, never carried. */
  otherShortfall: number
  /** The part of the retention rule a thin week could not cover. */
  retentionShortfall: number
  /**
   * WHAT THE WORKER IS HANDED. Computed here, once, in one order.
   *
   * The route used to re-derive this by subtracting each figure from gross itself, and got the
   * order wrong: retention and advance were capped against a gross that had not yet had the
   * one-off deductions taken out of it, then the deductions were subtracted raw on top and the
   * result clamped at zero. Rs 1,800 earned could pay out Rs 2,300 of obligations, with the
   * Rs 500 that did not exist simply disappearing into the clamp -- and owedAfter then reported
   * an advance balance assuming money that was never recovered.
   */
  net: number
  /** Balances as they stand after this run. */
  heldAfter: number
  owedAfter: number
  /** Whether any rule applied at all — drives whether a column is shown. */
  hasRule: boolean
}

const round = (n: number) => Math.round(n * 100) / 100

/** One run from the start, for callers that give a start date and mean a single payroll run. */
const impliedPeriodEnd = (periodStart: string, periodDays: number): string => {
  const t = Date.parse(`${periodStart}T00:00:00Z`)
  if (!Number.isFinite(t)) return periodStart
  return new Date(t + (periodDays - 1) * 86400000).toISOString().slice(0, 10)
}

/**
 * Retention, overtime and advance recovery for one worker over one period.
 *
 * Retention is computed DAY BY DAY, not from the period total, because the rule in force can change
 * mid-period and because a half day must retain half. Summing the period first and applying one
 * percentage would be right only while nothing ever changes, which is the assumption that makes
 * payroll bugs invisible until somebody's rate moves.
 */
export function computeWorkerPay(
  input: PeriodInput,
  workerId: string,
  gross: number,
  /**
   * A contract crew is paid for a JOB, not for a person's day, so no rule applies to it.
   *
   * Manoj, unprompted, on the call: "Contract gangs do NOT receive retention." Nothing implemented
   * it -- computeWorkerPay never saw a worker's `kind`, so a crew with allocations would have been
   * held back 20% of a lump sum as though it were somebody's wage, and the estate would have been
   * withholding money it has no one to settle with. Latent today: no tenant has a gang on its
   * roster. Latent is not fixed.
   *
   * Overtime is excluded for the same reason: a crew has no hourly rate to multiply.
   *
   * `fallbackDayRate` is the worker's roster rate, used to price overtime on a day the muster has
   * nothing to say about — see the overtime loop below for why the alternative was worse.
   */
  options?: {
    isGang?: boolean
    fallbackDayRate?: number | null
    /**
     * One-off amounts withheld this period — a fine, damage, food. NOT advances, which recover on
     * their own schedule.
     *
     * Passed in so every obligation is capped against the same wage in one place. Applying it
     * outside is what let three deductions each be taken from the full gross independently.
     */
    otherDeductions?: number
  },
): WorkerPay {
  const days = input.workedDays.filter((d) => d.workerId === workerId)
  const ot = input.overtimeDays.filter((d) => d.workerId === workerId)
  const entries = input.ledger.filter((e) => e.workerId === workerId)
  const runDays = input.periodDays ?? 7
  const periodEnd = input.periodEnd ?? impliedPeriodEnd(input.periodStart, runDays)

  let retention = 0
  let hasRule = false
  const rulesApply = !options?.isGang
  /**
   * RETENTION IS HELD AGAINST DAYS WORKED, NOT AGAINST A MONTHLY SALARY. Deliberate, not an
   * oversight — and worth stating because the two are added together into gross a few lines down,
   * so a reader can reasonably expect both to be retained from.
   *
   * The only retention rule any estate has stated is Manoj's: "20% of the day's pay". A day is the
   * unit; a salaried writer does not have one. retentionForDay wants a rate and a day_fraction,
   * and a monthly wage supplies neither — inventing them would mean deciding, on the estate's
   * behalf, whether a salary is 26 days or 30, and whether a staff member on leave is retained
   * from. Those are the estate's decisions and nobody has been asked yet.
   *
   * So a salaried worker is retained from only on the days they also appear on the muster, which
   * is the same treatment any other worker gets for those days.
   *
   * ⚠ THE CONSEQUENCE, STATED PLAINLY: if an estate ever wants retention held against salary, this
   * will quietly not do it — salary lands in gross, retention stays at zero, and net is higher
   * than they meant. Nobody is exposed today. Prod carries zero pay rules, and the only two
   * monthly-paid workers (both at Laxmi) belong to a tenant with none, so retention is zero for
   * them under any reading. Raised by Greptile on the pay-rules PR, 2026-09-11.
   *
   * The fix, when an estate asks for it, is a retention mode that names its own base — not a
   * default guessed here. tests/salary-retention-is-a-decision.test.ts pins the current behaviour
   * so that change has to be made on purpose.
   */
  for (const day of rulesApply ? days : []) {
    const rule = resolveRuleForDate(input.rules, workerId, day.workDate)
    if (rule?.retentionMode) hasRule = true
    retention += retentionForDay(rule, day.rate, day.dayFraction)
  }

  // Overtime is priced by the rule in force on the day it was worked, and by that day's rate --
  // not the worker's current one, for the same reason retention uses the stored rate.
  let overtime = 0
  for (const day of rulesApply ? ot : []) {
    const rule = resolveRuleForDate(input.rules, workerId, day.workDate)
    if (rule?.overtimeMode) hasRule = true
    /**
     * The rate on THAT day, or the worker's roster rate — never another day's.
     *
     * This fell back to `days[0].rate`, which is whichever worked day the query happened to return
     * first. An estate that marks attendance without allocating work (three of the four live ones)
     * has no muster row for the day, so every overtime payment would have been priced off an
     * unrelated day at an unrelated rate, and off nothing at all — Rs 0 — for a worker with no
     * allocations in the period. Both are confident wrong answers on a wage sheet.
     */
    const rateThatDay =
      days.find((d) => d.workDate === day.workDate)?.rate ??
      (options?.fallbackDayRate != null ? Number(options.fallbackDayRate) : 0)
    overtime += overtimePay(rule, { dayRate: rateThatDay, hours: day.hours })
  }

  // Every instalment inside the range, so a month agrees with the four weekly runs it contains.
  const scheduledThisPeriod = entries.reduce(
    (sum, e) => sum + instalmentsDueInRange(e, input.periodStart, periodEnd, runDays),
    0,
  )

  /**
   * ⚠ NEVER COLLECT MORE THAN IS STILL OWED.
   *
   * The schedule is a plan, not a debt. instalmentsDueInRange answers "what was this advance meant
   * to give up in these dates", which is a pure function of the amount, the number of periods and
   * the start date — it has never once looked at whether the worker has already handed the money
   * back in cash.
   *
   * So a Rs 8,000 advance over four Rs 2,000 runs, followed by a Rs 3,000 repayment, went on
   * taking all four instalments: Rs 11,000 recovered against Rs 8,000 lent. And because owedAfter
   * clamps at zero, the balance showed a tidy Rs 0 while the worker was Rs 3,000 down. Nothing on
   * the sheet said otherwise, which is the part that makes it serious — the over-recovery is
   * invisible at exactly the moment somebody could still catch it.
   *
   * Raised by Greptile on the pay-rules PR, 2026-09-11. No estate has recorded an advance yet, so
   * nobody has been short-paid; the schedule shipped before the first advance did.
   *
   * CAPPED PER WORKER, NOT PER ADVANCE, because a repayment is not linked to a particular advance —
   * worker_ledger has no column for it, and an estate handed a Rs 3,000 note does not say which of
   * two advances it settles. Pooling is the only honest reading of the rows we have.
   *
   * outstandingAdvance(entries) is everything advanced less everything repaid in cash; subtracting
   * what the schedule already took before this range leaves what recovery can still legitimately
   * take. It inherits the optimism noted on owedAfter below — an earlier short run is assumed to
   * have paid its full instalment — so the cap can still be slightly generous. It can no longer be
   * unbounded, which is the difference between an imprecise figure and a wrong one.
   */
  /**
   * ONLY MONEY THAT HAD ALREADY CHANGED HANDS BY THE END OF THIS RANGE.
   *
   * Without the date filter, a repayment made in week four would shrink week one's deduction when
   * week one is re-printed — quietly disagreeing with the sheet the worker was actually paid from,
   * and with no way to tell which run produced which figure. A payroll run has to be reproducible
   * from the rows that existed when it happened.
   */
  const knownBy = (entry: { entryDate: string }) => entry.entryDate <= periodEnd
  const recoverableBeforeThisPeriod = Math.max(
    0,
    outstandingAdvance(entries.filter(knownBy)) -
      entries.reduce((sum, e) => sum + recoveredBeforeDate(e, input.periodStart, runDays), 0),
  )
  const advanceDue = Math.min(scheduledThisPeriod, recoverableBeforeThisPeriod)

  /**
   * Overtime is earnings, so it is deducted FROM -- an estate that pays overtime and then holds
   * nothing against it would be retaining a smaller share than the rule says.
   *
   * ⚠ CAPPING IS PER RANGE, NOT PER RUN. Over one week that is the same thing. Over a month it is
   * not: four weekly runs each cap recovery at their own thin week, whereas the month caps once
   * against the whole month's earnings, so a month view can report less shortfall than the four
   * weeks inside it did. The money recovered is identical either way; only the "could not recover"
   * line differs. Pay from the week, reconcile with the month.
   */
  const applied = applyDeductions({
    gross: gross + overtime,
    retention,
    advanceDue,
    otherDeductions: options?.otherDeductions ?? 0,
  })

  return {
    workerId,
    retention: applied.retention,
    overtime: round(overtime),
    advanceDue: round(advanceDue),
    advanceRecovered: applied.advanceRecovered,
    shortfall: applied.shortfall,
    otherDeductions: applied.otherDeductions,
    otherShortfall: applied.otherShortfall,
    retentionShortfall: applied.retentionShortfall,
    net: applied.net,
    /**
     * What the estate holds after this run.
     *
     * retentionHeld() sums `retention_accrual` ROWS, and there are none -- retention is derived,
     * not written (the decision recorded in docs/PAYROLL-NEXT-STEPS.md step 1). So this is only
     * ever this period's retention plus any accrual somebody recorded by hand, and a month of
     * weekly runs shows one week's worth rather than four.
     *
     * Correct for a single run, WRONG as a running balance, and the caller cannot tell which it is
     * getting. The Workers panel therefore derives the held figure from the full ledger itself
     * rather than reading this. Fixing it properly is the derive-or-write decision, not a patch.
     */
    heldAfter: round(retentionHeld(entries) + applied.retention),
    /**
     * What is still owed after this run: everything advanced, less cash repaid, less what has
     * ACTUALLY been recovered.
     *
     * Scheduled recovery BEFORE this range began, plus what this range genuinely took -- which is
     * not always the instalment, because a thin week caps recovery at the wage.
     *
     * Measured from the range's own start date rather than "the previous run", which only had a
     * meaning while every range happened to be exactly one run long.
     *
     * ⚠ THE HONEST LIMIT OF A DERIVED BALANCE. If an EARLIER run was also short, this still assumes
     * it recovered its full instalment, so the figure is optimistic by that shortfall. It cannot be
     * otherwise without recording what each run actually took — which is precisely the
     * derive-or-write decision in docs/PAYROLL-NEXT-STEPS.md, arriving with a concrete cost rather
     * than as a preference. Until then the shortfall is shown on the run it happened, so the
     * discrepancy is visible on the sheet rather than only in the balance.
     */
    owedAfter: round(
      Math.max(
        0,
        outstandingAdvance(entries) -
          entries.reduce((sum, e) => sum + recoveredBeforeDate(e, input.periodStart, runDays), 0) -
          applied.advanceRecovered,
      ),
    ),
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
