import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A total has to say which window it means.
 *
 * `app/api/worker-ledger` returned `entries` scoped to ?startDate/?endDate and, in the same
 * response, a `total_deductions` summed over ALL TIME. The card rendering it labelled that figure
 * "(filtered period)" -- so the screen asserted the one thing that was false. Meanwhile
 * `app/api/payroll-summary`'s own `ledger_totals` CTE *is* period-scoped and uses the same words for
 * the narrower thing. Three surfaces, two meanings, one vocabulary.
 *
 * Nobody had hit it because `worker_ledger` has 0 rows in every tenant -- it is a bug that only
 * becomes visible on the first real advance, and becomes visible as somebody's pay.
 *
 * This is what makes an advance appear to "still be there next month": not a missing settlement
 * step, but a lifetime total read as a period one. The fix is not to add a flag somebody must
 * remember to tick -- forgetting that deducts the same advance twice -- it is to name both windows.
 * See docs/PAYROLL-RULES-PLAN.md.
 *
 * These are source assertions rather than behavioural ones because both are raw SQL against a
 * tenant-scoped DB, and the invariant worth protecting is structural: the period window must exist,
 * the lifetime window must be labelled as such, and payroll must keep its date filter.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8")

const ledgerRoute = read("app/api/worker-ledger/route.ts")
const payrollRoute = read("app/api/payroll-summary/route.ts")

describe("the ledger reports two windows, each named", () => {
  it("computes a period total that honours the request's dates", () => {
    expect(ledgerRoute).toContain("in_period")
    expect(ledgerRoute).toMatch(/entry_date >= COALESCE\(\$\{startDate\}::date, entry_date\)/)
    expect(ledgerRoute).toMatch(/entry_date <= COALESCE\(\$\{endDate\}::date, entry_date\)/)
  })

  it("still computes a lifetime total, because outstanding debt is a real question", () => {
    // Deleting the unscoped figure would be the wrong fix: the Workers panel and the exit
    // settlement both need "what does this person still owe", which is not a period question.
    for (const field of ["lifetime_advances", "lifetime_deductions", "lifetime_adjustments"]) {
      expect(ledgerRoute).toContain(field)
    }
  })

  it("returns them under names that cannot be confused", () => {
    expect(ledgerRoute).toContain("workerTotals")
    expect(ledgerRoute).toMatch(/period:\s*\{/)
    expect(ledgerRoute).toMatch(/lifetime:\s*\{/)
    // The old shape said neither, which is how it got read as the wrong one.
    expect(ledgerRoute).not.toContain("totalDeductions")
    expect(ledgerRoute).not.toContain("workerBalance")
  })

  it("keeps advances separate from one-off deductions", () => {
    // They are different obligations: an advance is money the worker holds and repays; a deduction
    // is money simply withheld. Summing them is what made a single figure meaningless.
    expect(ledgerRoute).not.toMatch(/entry_type IN \('advance','deduction'\)/)
    expect(ledgerRoute).toContain("period_advances")
    expect(ledgerRoute).toContain("period_deductions")
  })
})

describe("payroll keeps the date filter that makes an advance stop applying", () => {
  it("scopes ledger_totals to the run's own dates", () => {
    // THIS is why no settlement flag is needed. An advance dated 12 August is inside an August run
    // and outside a September one. Remove this filter and every past advance is deducted forever.
    const cte = payrollRoute.slice(payrollRoute.indexOf("ledger_totals AS ("))
    expect(cte).toMatch(/entry_date BETWEEN \$\{startDate\}::date AND \$\{endDate\}::date/)
  })

  it("does not write anything while computing a period", () => {
    // Re-running a closed month must give the same answer forever. The moment payroll writes a
    // recovery row on read, viewing the tab changes what it reports.
    for (const write of ["INSERT INTO", "UPDATE ", "DELETE FROM"]) {
      expect(payrollRoute).not.toContain(write)
    }
  })
})
