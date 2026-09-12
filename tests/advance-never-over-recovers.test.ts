import { describe, expect, it } from "vitest"

import { computeWorkerPay, type PeriodInput } from "../lib/payroll-period"
import { instalmentsDueInRange, outstandingAdvance, type LedgerEntry } from "../lib/pay-rules"

/** PeriodInput.ledger carries the worker each entry belongs to; LedgerEntry itself does not. */
type WorkerEntry = LedgerEntry & { workerId: string }
import type { PayRule } from "../lib/pay-rules"

/**
 * An estate can never take more off a worker than the worker still owes.
 *
 * THE BUG. `advanceDue` was the sum of `instalmentsDueInRange`, which is a pure function of the
 * advance's amount, its period count and its start date. It did not read the ledger's repayment
 * rows, so cash handed back never reduced what the schedule went on collecting.
 *
 *   Rs 8,000 advance, four weekly instalments of Rs 2,000
 *   worker repays Rs 3,000 in cash after week one
 *   → weeks two, three and four still deduct Rs 2,000 each
 *   → Rs 8,000 recovered from wages + Rs 3,000 in cash = Rs 11,000 against Rs 8,000 lent
 *
 * And `owedAfter` clamps at zero, so the balance read a tidy Rs 0 the whole way down. The estate
 * has no line anywhere saying the worker is Rs 3,000 in credit. That is the part that makes it
 * worth a test rather than a fix: the arithmetic error is recoverable, the silence is not.
 *
 * Raised by Greptile on the pay-rules PR, 2026-09-11. Nobody has been short-paid — no estate has
 * recorded an advance yet, the schedule shipped before the first advance did.
 *
 * The cap is PER WORKER, not per advance. worker_ledger has no column linking a repayment to the
 * advance it settles, and an estate handed a Rs 3,000 note does not say which of two advances it
 * is for. Pooling is the only reading the rows support.
 */

const rule: PayRule = {
  workerId: null,
  effectiveFrom: "2026-04-01",
  retentionMode: null,
  retentionValue: null,
  overtimeMode: null,
  overtimeValue: null,
  fullDayHours: 8,
  pfPercent: null,
}

const advance = (amount: number, periods: number, from: string, id = `adv-${from}`): WorkerEntry => ({
  id,
  workerId: "ravi",
  entryType: "advance",
  entryDate: from,
  amount,
  recoverOverPeriods: periods,
  recoverFrom: from,
})

const repayment = (amount: number, date: string): WorkerEntry => ({
  id: `rep-${date}-${amount}`,
  workerId: "ravi",
  entryType: "repayment",
  entryDate: date,
  amount,
})

/** Six full days at Rs 600 = Rs 3,600 gross, the week Medappa actually runs. */
const week = (start: string) =>
  Array.from({ length: 6 }, (_, i) => ({
    workerId: "ravi",
    workDate: `2026-08-${String(Number(start.slice(-2)) + i).padStart(2, "0")}`,
    dayFraction: 1,
    rate: 600,
  }))

const run = (periodStart: string, ledger: WorkerEntry[]) => {
  const input: PeriodInput = {
    rules: [rule],
    workedDays: week(periodStart),
    overtimeDays: [],
    ledger,
    periodStart,
  }
  return computeWorkerPay(input, "ravi", 3600)
}

describe("a repayment reduces what the schedule may still take", () => {
  const WEEKS = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"]

  it("collects the full schedule when nothing is repaid", () => {
    // The baseline the fix must not disturb: four Rs 2,000 instalments, Rs 8,000 total.
    const ledger = [advance(8000, 4, "2026-08-03")]
    const collected = WEEKS.reduce((sum, w) => sum + run(w, ledger).advanceRecovered, 0)
    expect(collected).toBe(8000)
  })

  it("stops at the advance once cash has covered part of it", () => {
    // Greptile's example, to the rupee. Rs 3,000 repaid, so wages may only supply Rs 5,000.
    const ledger = [advance(8000, 4, "2026-08-03"), repayment(3000, "2026-08-09")]
    const collected = WEEKS.reduce((sum, w) => sum + run(w, ledger).advanceRecovered, 0)
    expect(collected).toBe(5000)
    expect(collected + 3000).toBe(8000)
  })

  it("takes nothing further once the advance is fully repaid in cash", () => {
    const ledger = [advance(8000, 4, "2026-08-03"), repayment(8000, "2026-08-09")]
    for (const w of WEEKS) {
      expect(run(w, ledger).advanceDue, `${w} still scheduled a deduction`).toBe(0)
      expect(run(w, ledger).advanceRecovered).toBe(0)
    }
  })

  it("a repayment larger than the advance never turns into a payment to the estate", () => {
    const ledger = [advance(2000, 4, "2026-08-03"), repayment(5000, "2026-08-09")]
    const p = run("2026-08-10", ledger)
    expect(p.advanceDue).toBe(0)
    expect(p.advanceRecovered).toBe(0)
    // And the wage is untouched — an over-repayment is the estate's problem to refund, not a
    // negative deduction that quietly inflates this week's pay.
    expect(p.net).toBe(3600)
  })

  it("pools repayments across advances, because the rows do not say which one they settle", () => {
    const ledger = [
      advance(4000, 4, "2026-08-03", "adv-a"),
      advance(4000, 4, "2026-08-03", "adv-b"),
      repayment(6000, "2026-08-09"),
    ]
    const collected = WEEKS.reduce((sum, w) => sum + run(w, ledger).advanceRecovered, 0)
    expect(collected).toBe(2000)
  })

  it("the scheduled figure and the recoverable figure are allowed to disagree", () => {
    /**
     * The schedule itself is unchanged — still a plan for Rs 2,000 a week. What changed is that
     * the plan is now bounded by the debt. Asserting both keeps the two ideas separate, so a later
     * edit cannot "simplify" the cap away by making the schedule shrink instead.
     *
     * Week two of a Rs 8,000 advance: week one already took Rs 2,000 off the wage, and the worker
     * then handed back Rs 5,500 in cash. Rs 500 of the advance is left, so the Rs 2,000 instalment
     * is cut to Rs 500 — a partial cap, which is the case that distinguishes a real bound from a
     * switch that only ever reads all-or-nothing.
     */
    const entry = advance(8000, 4, "2026-08-03")
    expect(instalmentsDueInRange(entry, "2026-08-10", "2026-08-16", 7)).toBe(2000)

    const ledger = [entry, repayment(5500, "2026-08-09")]
    // "Advanced less cash repaid" — deliberately blind to wage recovery, which is why the cap
    // subtracts recoveredBeforeDate rather than trusting this number on its own.
    expect(outstandingAdvance(ledger)).toBe(2500)
    expect(run("2026-08-10", ledger).advanceDue).toBe(500)
  })

  it("takes nothing more once wages and cash together have covered the advance", () => {
    // Rs 2,000 off week one's wage, then Rs 7,500 back in cash — Rs 9,500 against Rs 8,000. The
    // worker is already Rs 1,500 ahead, so week two takes nothing rather than another Rs 500.
    const ledger = [advance(8000, 4, "2026-08-03"), repayment(7500, "2026-08-09")]
    expect(run("2026-08-10", ledger).advanceDue).toBe(0)
  })

  it("still reports the balance honestly rather than clamping a credit to zero", () => {
    const ledger = [advance(8000, 4, "2026-08-03"), repayment(3000, "2026-08-09")]
    // After all four weeks the worker owes nothing and has not been over-collected.
    const last = run("2026-08-24", ledger)
    expect(last.owedAfter).toBe(0)
    const collected = WEEKS.reduce((sum, w) => sum + run(w, ledger).advanceRecovered, 0)
    expect(collected).toBeLessThanOrEqual(8000 - 3000)
  })
})

describe("the cap does not break a thin week", () => {
  it("a week that cannot cover the instalment still reports the shortfall", () => {
    // One day worked, Rs 600 gross, Rs 2,000 due. The cap is against the DEBT, not the wage;
    // applyDeductions still caps against the wage, and both limits have to survive together.
    const input: PeriodInput = {
      rules: [rule],
      workedDays: [{ workerId: "ravi", workDate: "2026-08-10", dayFraction: 1, rate: 600 }],
      overtimeDays: [],
      ledger: [advance(8000, 4, "2026-08-03")],
      periodStart: "2026-08-10",
    }
    const p = computeWorkerPay(input, "ravi", 600)
    expect(p.advanceDue).toBe(2000)
    expect(p.advanceRecovered).toBe(600)
    expect(p.shortfall).toBe(1400)
    expect(p.net).toBe(0)
  })
})
