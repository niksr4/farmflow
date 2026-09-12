import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { applyDeductions } from "@/lib/pay-rules"
import { computeWorkerPay, type PeriodInput } from "@/lib/payroll-period"

/**
 * A wage sheet must account for every rupee it started with.
 *
 * THE BUG THIS EXISTS FOR. Retention and advance recovery were capped by applyDeductions against a
 * gross that had not yet had one-off deductions taken out of it. The route then subtracted the
 * deduction itself, raw, and clamped the result with `Math.max(0, …)`. So three obligations were
 * each measured against the same money:
 *
 *   earned 1,800 · fine 500 · retention 360 · advance recovered 1,440
 *   → net 0, and 2,300 of obligations settled out of 1,800 that existed
 *
 * The 500 that could not be paid vanished into the clamp — no shortfall line, nothing on the
 * export, nothing in the totals. Worse, `owedAfter` then reported the advance balance as though
 * 1,440 had genuinely been recovered, so the error compounded into the next week's figure rather
 * than staying on the week it happened.
 *
 * The clamp is what made it invisible. A negative net would have been obviously wrong; zero looks
 * like a thin week.
 */

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8")

const RULE = {
  workerId: null,
  effectiveFrom: "2026-01-01",
  retentionMode: "percent_of_day" as const,
  retentionValue: 20,
  overtimeMode: null,
  overtimeValue: null,
  fullDayHours: null,
  pfPercent: null,
}

/** Three days at Rs 600 and a Rs 2,000 advance due in full this week. */
const thinWeek = (otherDeductions: number) => {
  const input: PeriodInput = {
    rules: [RULE],
    workedDays: ["2026-08-03", "2026-08-04", "2026-08-05"].map((d) => ({
      workerId: "w1", workDate: d, dayFraction: 1, rate: 600,
    })),
    overtimeDays: [],
    ledger: [{
      workerId: "w1", id: "a", entryType: "advance", entryDate: "2026-08-03",
      amount: 2000, recoverOverPeriods: 1, recoverFrom: null,
    }],
    periodStart: "2026-08-02",
    periodEnd: "2026-08-08",
  }
  return computeWorkerPay(input, "w1", 1800, { otherDeductions })
}

describe("nothing is settled twice out of the same wage", () => {
  it("accounts for exactly what was earned, fine and all", () => {
    const p = thinWeek(500)
    // THE ACTUAL BUG: this summed to 2,300 against a gross of 1,800.
    expect(p.retention + p.otherDeductions + p.advanceRecovered + p.net).toBe(1800)
  })

  it("says what it could not take rather than clamping it away", () => {
    const p = thinWeek(500)
    expect(p.otherDeductions).toBe(500)
    // 1,800 − 360 retention − 500 fine = 940 available against a 2,000 instalment.
    expect(p.advanceRecovered).toBe(940)
    expect(p.shortfall).toBe(1060)
    expect(p.net).toBe(0)
  })

  it("leaves the right balance, not one assuming money it never recovered", () => {
    // 2,000 advanced, 940 actually taken. The old path claimed 1,440 and carried the error forward.
    expect(thinWeek(500).owedAfter).toBe(1060)
  })

  it("reports a fine bigger than the whole wage instead of swallowing it", () => {
    const p = thinWeek(5000)
    expect(p.otherDeductions).toBe(1440) // 1,800 − 360 retention
    expect(p.otherShortfall).toBe(3560)
    expect(p.advanceRecovered).toBe(0)
    expect(p.net).toBe(0)
    expect(p.retention + p.otherDeductions + p.advanceRecovered + p.net).toBe(1800)
  })

  it("holds retention ahead of a fine, because it is the worker's own money", () => {
    // The order is the point: a thin week still holds the full 360 and gives way on the fine.
    expect(thinWeek(5000).retention).toBe(360)
    expect(thinWeek(5000).retentionShortfall).toBe(0)
  })

  it("reports retention the wage could not cover, on a week thin enough", () => {
    const p = applyDeductions({ gross: 100, retention: 360, advanceDue: 0, otherDeductions: 0 })
    expect(p.retention).toBe(100)
    expect(p.retentionShortfall).toBe(260)
    expect(p.net).toBe(0)
  })

  it("changes nothing for an ordinary week", () => {
    // Six days, no fine: everything is affordable and net is simply what is left.
    const p = thinWeek(0)
    expect(p.retention).toBe(360)
    expect(p.advanceRecovered).toBe(1440)
    expect(p.shortfall).toBe(560)
    expect(p.net).toBe(0)
  })
})

describe("the route hands the arithmetic one job", () => {
  const route = read("app/api/payroll-summary/route.ts")

  it("passes deductions in rather than subtracting them afterwards", () => {
    expect(route).toContain("otherDeductions: w.deductions")
  })

  it("takes the net it is given instead of re-deriving one", () => {
    expect(route).toContain("netPayable: pay.net")
    // The re-derivation AND its clamp, which is what hid the discrepancy.
    expect(route).not.toMatch(/Math\.max\(0, Math\.round\(net \* 100\)/)
  })

  it("totals what was actually withheld, so the column sums to the net beside it", () => {
    expect(route).toContain("deductions: acc.deductions + w.deductionsTaken")
  })
})

describe("the screen shows what was taken, not what was typed", () => {
  const tab = read("components/payroll-summary-tab.tsx")

  it("displays the withheld figure everywhere a deduction appears", () => {
    // A Rs 500 fine against a Rs 300 week withholds Rs 300. Printing Rs 500 beside a net of Rs 0
    // is a row that does not add up.
    expect(tab).toContain("const withheld = (w: PayrollWorker)")
    expect(tab).not.toMatch(/formatCurrency\(w\.deductions\)/)
    expect(tab).not.toMatch(/w\.deductions\.toFixed\(2\)/)
  })

  it("shows the part it could not take, in both layouts and the export", () => {
    expect(tab).toMatch(/Could not deduct/)
    expect(tab).toMatch(/short\)/)
    expect(tab).toContain("Deduction Not Taken (₹)")
  })
})

describe("a wage sheet shows everyone who worked", () => {
  const route = read("app/api/payroll-summary/route.ts")

  /**
   * THE BUG THIS EXISTS FOR, found by running a real week against production on 2026-09-10.
   *
   * payroll-summary filtered `w.active = TRUE`. Deactivating a worker therefore erased every day
   * they had ever worked from the wage sheet — retrospectively, including weeks already closed.
   * At Medappa that was not a rounding error:
   *
   *   16–22 Aug   14 of 33 workers hidden — Rs 38,200 of Rs 79,600   (48% of the wage bill)
   *   23–29 Aug   12 of 34 workers hidden — Rs 45,800 of Rs 1,05,200 (44%)
   *   30 Aug–5 Sep 10 workers hidden      — Rs 10,525
   *
   * Only ONE of those worker-days is also recorded against an active row, so it was not work that
   * moved to another row — it was work no screen could show. And the remaining total looked
   * entirely plausible, which is why nobody could have noticed from the number alone.
   */
  /**
   * The MAIN query's WHERE only — from its FROM clause onwards.
   *
   * Scoped because salary_earnings above it has its own `WHERE w.tenant_id … AND w.active = TRUE`
   * which is correct and must stay. A file-wide regex cannot tell the two apart, and matched the
   * one it was meant to protect.
   */
  const mainWhere = route.slice(route.indexOf("FROM attendance_workers w\n        LEFT JOIN"))

  it("does not filter the roster down to who is still on it", () => {
    expect(mainWhere).not.toMatch(/WHERE w\.tenant_id = \$\{tenantContext\.tenantId\}\s*\n\s*AND w\.active = TRUE/)
    // The roster gate is `active OR <had something happen this period>`. The right-hand side is
    // now one named fragment rather than an inline list — see below for why.
    expect(mainWhere).toMatch(/w\.active = TRUE\s*\n\s*OR \$\{workedThisPeriod\}/)
  })

  it("admits a former worker only when they actually worked in this period", () => {
    // Otherwise deactivating a duplicate repopulates every past week with an empty row.
    for (const term of ["COALESCE(m.muster_total, 0) > 0", "COALESCE(a.days_present, 0) > 0", "COALESCE(p.picking_total, 0) > 0"]) {
      expect(route).toContain(term)
    }
  })

  it("counts a ledger entry as activity in BOTH gates, not just the second", () => {
    /**
     * THE REGRESSION THIS EXISTS FOR. The two gates were written out separately and drifted: the
     * roster gate listed muster, attendance and picking, while the has-anything-happened gate four
     * lines below also counted worker_ledger deductions and adjustments.
     *
     * So an INACTIVE worker carrying a deduction and nothing else failed the first gate and
     * vanished from the sheet — while the second gate said, in as many words, that a ledger entry
     * is payroll activity. The money was recorded and the worker was not on the list, so the
     * totals were short by exactly their line.
     *
     * Mine, from the fix that stopped `w.active = TRUE` erasing Rs 81,925 of work at Medappa: I
     * widened the gate for WORK and forgot that money can arrive without work attached. Raised by
     * Greptile, 2026-09-11. Latent — prod carries no ledger deductions or adjustments at all yet.
     *
     * Fixed by naming the condition once and using it in both places, so they cannot disagree
     * again. This asserts the single definition rather than the two copies.
     */
    expect(route).toMatch(/const workedThisPeriod = accountsSql`\(/)
    const fragment = route.slice(route.indexOf("const workedThisPeriod"), route.indexOf("const rows ="))
    for (const term of ["l.total_deductions", "l.total_adjustments", "a.days_present", "m.muster_total", "p.picking_total"]) {
      expect(fragment, `${term} missing from the shared activity definition`).toContain(term)
    }
    // Used in both gates, never re-spelt inline in one of them.
    expect((route.match(/\$\{workedThisPeriod\}/g) ?? []).length).toBe(2)
  })

  it("still refuses to accrue a salary for somebody who has left", () => {
    // active stays required in salary_earnings: a monthly wage is for being employed, and a former
    // employee must not keep earning one just because the roster row survives.
    const salaryCte = route.slice(route.indexOf("salary_earnings AS ("), route.indexOf("ledger_totals AS ("))
    expect(salaryCte).toContain("AND w.active = TRUE")
  })

  it("says on the sheet that they have left, rather than including them silently", () => {
    const tab = read("components/payroll-summary-tab.tsx")
    expect(route).toContain("onRoster: r.on_roster !== false")
    expect(tab).toContain("w.onRoster === false")
    // And on the file an estate pays from, not only the screen.
    expect(tab).toContain("(left the roster)")
  })
})

describe("retention held is derived, because nothing writes it", () => {
  const route = read("app/api/worker-ledger/route.ts")
  const panel = read("components/workers/worker-money-panel.tsx")

  /**
   * `retention_accrual` rows are created by exactly one thing in this repository: the dev seeder.
   * The route refuses them, payroll derives retention instead of writing it, and no migration
   * backfills any. So summing those rows — which is what the panel did — returned Rs 0 on every
   * real estate, permanently, while payroll deducted 20% of every day worked. The one screen that
   * answers "how much are you keeping for me" gave a confident zero.
   */
  it("the route derives it from days worked and the rule in force", () => {
    expect(route).toContain("retentionHeldToDate")
    expect(route).toContain("resolveRuleForDate")
    expect(route).toContain("retentionForDay")
    // The same day-rate expression payroll uses, so the two cannot drift apart.
    expect(route).toContain("SUM(total_cost) / NULLIF(SUM(day_fraction), 0)")
  })

  it("it still honours a hand-recorded opening balance and any payout", () => {
    expect(route).toContain("lifetime_retention_accrual")
    expect(route).toContain("lifetime_retention_payout")
  })

  it("the panel reads that figure instead of summing rows that do not exist", () => {
    expect(panel).toContain("setHeld(Number(ledger.retentionHeldToDate) || 0)")
    // Comments legitimately name the old call to explain why it is gone, so only code counts.
    const codeOnly = panel
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
      .join("\n")
    expect(codeOnly).not.toContain("retentionHeld(entries)")
    expect(codeOnly).not.toMatch(/import \{[^}]*retentionHeld/)
  })
})

describe("retention applies to a day that was marked but never allocated", () => {
  const route = read("app/api/payroll-summary/route.ts")

  /**
   * ⚠ AN ESTATE THAT TAKES ATTENDANCE AND DOES NOT RUN THE MUSTER WAS HELD NOTHING.
   *
   * Gross falls back to `days_present x daily_rate` for exactly those workers — attendance_earnings
   * COALESCEs salary, then muster, then days x rate — so they ARE paid. But the retention input was
   * drawn only from labour_assignments, which for them is empty. An estate could set "hold 20% of
   * the day", watch the column appear on the wage sheet, and withhold nothing at all: net pay
   * overstated by the entire retention, on every worker, indefinitely.
   *
   * Raised by Greptile on PR #11, 2026-09-12. Latent — production carries no pay rules yet — but
   * three of the four live estates take attendance without allocating, so it would have been the
   * FIRST thing any of them hit.
   *
   * Distinct from the monthly-salary decision in lib/payroll-period.ts, which deliberately holds
   * nothing: a salary has no day to take a percentage of, an attendance row is precisely a day at a
   * known rate. Well-defined here, undefined there.
   */
  it("feeds marked-but-unallocated days into the retention basis", () => {
    expect(route).toContain("attendanceOnlyRows")
    expect(route).toMatch(/workedDays: \[\.\.\.\(workedRows as any\[\]\), \.\.\.\(attendanceOnlyRows as any\[\]\)\]/)
  })

  it("excludes any day the muster already speaks for, so nothing is held twice", () => {
    // The two sources must be disjoint: where an allocation exists it carries the rate actually
    // earned, which is the more precise figure and the one every other screen reports.
    const block = route.slice(route.indexOf("DAYS THAT WERE MARKED BUT NEVER ALLOCATED"))
    expect(block.slice(0, 2600)).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM labour_assignments la/)
  })

  it("leaves monthly-paid workers out, matching where their gross comes from", () => {
    const block = route.slice(route.indexOf("DAYS THAT WERE MARKED BUT NEVER ALLOCATED"))
    expect(block.slice(0, 2600)).toContain("MONTHLY_PAID_WORKER_TYPES")
  })

  it("takes the rate from the worker's own daily rate, and skips those without one", () => {
    // A worker with no rate earns nothing from this basis, so holding a percentage of it would be
    // holding a percentage of an unknown. missingRate already flags them elsewhere.
    const block = route.slice(route.indexOf("DAYS THAT WERE MARKED BUT NEVER ALLOCATED"))
    expect(block.slice(0, 2600)).toContain("w.daily_rate IS NOT NULL")
  })
})
