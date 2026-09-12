import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { resolveRuleForDate, type PayRule } from "@/lib/pay-rules"

/**
 * A rule an estate cannot set is a feature nobody has.
 *
 * Everything else was built first: the table, the arithmetic, the API, the panel that displays a
 * rule, and a payroll that applies one. For a day, all of it worked and none of it was reachable —
 * the only UI reference to /api/worker-pay-rules was a GET, and the demo only had rules because a
 * seed script wrote them straight into the database. Every real estate would have seen "No
 * retention set" on every worker and no columns on payroll, with nothing to click.
 *
 * That is a specific failure worth a guard: shipping a complete back end and calling it done.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8")

const form = read("components/workers/pay-rule-form.tsx")
const panel = read("components/workers/worker-money-panel.tsx")
const roster = read("components/worker-profiles-tab.tsx")

describe("an estate can set its own rules from the app", () => {
  it("something actually POSTs a rule", () => {
    // Matched loosely on purpose: the URL is now chosen between adding and correcting, so pinning
    // the literal string broke on a change that made the form strictly better.
    expect(form).toContain("/api/worker-pay-rules")
    expect(form).toContain('"POST"')
  })

  it("and an existing rule can be corrected in place or removed", () => {
    // PUT and DELETE existed on the route with nothing calling them — the same unreachable-back-end
    // failure as the route nothing called at all, one level down. Correcting is deliberately NOT
    // the default: adding a dated rule never rewrites a paid week; correcting one does by design.
    expect(form).toContain('"PUT"')
    expect(form).toContain('method: "DELETE"')
    expect(form).toMatch(/setMode\("add" \| "correct"|useState<"add" \| "correct">\("add"\)/)
  })

  it("warns before correcting, because it changes weeks already paid", () => {
    expect(form).toMatch(/for every week it already covers/i)
  })

  it("says what removing a rule does, rather than just asking twice", () => {
    expect(form).toMatch(/takes over again/i)
    expect(form).toMatch(/stays held/i)
  })

  it("the estate-wide default is reachable, with worker_id null", () => {
    // One row covers everybody. Medappa set 20% once rather than twenty-nine times.
    expect(roster).toContain("<PayRuleForm")
    expect(roster).toContain("workerId={null}")
  })

  it("a per-worker override is reachable from that worker", () => {
    expect(panel).toContain("<PayRuleForm")
    expect(panel).toContain("workerId={workerId}")
  })

  it("both are admin-only, matching the route", () => {
    // The API refuses a writer; the UI must not offer them a button that 403s.
    expect(roster).toMatch(/isAdmin && \(\s*<Button[\s\S]{0,200}Pay rules/)
    expect(panel).toContain("canAdmin && (")
  })
})

describe("the form tells the truth about what saving does", () => {
  it("shows the effective-from date rather than hiding it", () => {
    // It is the whole reason a payslip printed in June still matches the screen in December. A form
    // that hid it would leave somebody expecting an edit and silently getting a new period.
    expect(form).toContain("In force from")
    expect(form).toContain("effectiveFrom")
  })

  it("says in words that saving adds a rule rather than editing one", () => {
    expect(form).toMatch(/from that date onwards/i)
    expect(form).toMatch(/do not change/i)
  })

  it("offers 'no retention' as a real choice, because that is how an estate stops", () => {
    // Not an empty field: an explicit None, dated, so what has already accrued stays accrued.
    expect(form).toContain('value: "none"')
    expect(form).toMatch(/No retention/)
  })

  it("previews what the rule does to a real day", () => {
    // "20%" means nothing to somebody paying Rs 600. "Holds Rs 120 on a full day" does.
    expect(form).toMatch(/on a full day/)
    expect(form).toMatch(/an hour/)
  })

  it("only asks for the working day's length when it is actually used", () => {
    // full_day_hours divides the daily rate for the hourly-derived mode and is meaningless for the
    // other two. Storing it regardless makes a field that looks like it controls something.
    expect(form).toContain('form.overtimeMode === "multiplier_of_hourly" ? Number(form.fullDayHours)')
  })
})

describe("one worker's card cannot change what every worker is held back", () => {
  /**
   * THE BUG. resolveRuleForDate falls back to the estate-wide default when a worker has no override
   * of their own — correctly, that is what "effective" means. The Workers panel then handed that
   * rule's row id straight to the correct-and-remove controls. So on any worker who was simply
   * inheriting the estate rule, which is all of them until somebody sets an override:
   *
   *   "Remove"  deleted the retention rule for the entire estate
   *   "Correct" rewrote what every worker was held back, retroactively, for every week it covered
   *
   * Under a heading naming one person, on a card showing one person's balances, with a confirm
   * saying "whatever applied before it takes over again". Twenty-nine people's pay, changed from a
   * screen about one of them.
   */
  const route = read("app/api/worker-pay-rules/route.ts")

  it("the route says which rule is the worker's OWN, separately from what applies to them", () => {
    expect(route).toContain("effectiveRule:")
    expect(route).toContain("workerRule:")
    // Resolved from the worker's own rows only, so an inherited estate rule cannot come back as
    // theirs. Server-side for the same reason effectiveRule is: re-deriving it in the client is
    // what breaks when two rules share an effective_from.
    expect(route).toMatch(/rules\.filter\(\(r\) => r\.workerId === workerId\)/)
  })

  it("the panel offers editing only against the worker's own row", () => {
    expect(panel).toContain("currentRuleId={ownRule?.id ?? null}")
    expect(panel).not.toContain("currentRuleId={rule?.id ?? null}")
  })

  it("and says which of the two the worker is on, rather than showing a bare percentage", () => {
    expect(panel).toMatch(/Inherited from the estate rule/)
    expect(panel).toMatch(/Set for this worker/)
  })

  it("the form refuses the mismatch itself, whatever a caller passes", () => {
    // A second line of defence on purpose. The fix one caller received does not protect the next
    // one; this holds the invariant where the correct-and-remove controls actually live.
    expect(form).toContain("editableRow")
    expect(form).toMatch(/\(current\.workerId \?\? null\) === \(workerId \?\? null\)/)
    // Both destructive paths, not just the button's visibility.
    expect(form).toMatch(/const correcting = mode === "correct" && editableRow/)
    expect(form).toMatch(/if \(!currentRuleId \|\| !editableRow\) return/)
  })

  it("the estate form still edits the estate rule, which is the case that must keep working", () => {
    // workerId null on both sides, so editableRow is true and the roster keeps its Remove.
    expect(roster).toContain("workerId={null}")
    expect(roster).toContain("currentRuleId={estateRule?.id ?? null}")
  })

  it("filtering to the worker's own rows is what makes the two answers differ", () => {
    // The arithmetic behind the fix, not just its wiring. Same call, same date, same worker --
    // the only difference is which rows it is allowed to see.
    const rules: PayRule[] = [
      {
        workerId: null,
        effectiveFrom: "2026-06-01",
        retentionMode: "percent_of_day",
        retentionValue: 20,
        overtimeMode: null,
        overtimeValue: null,
        fullDayHours: null,
        pfPercent: null,
      },
    ]
    expect(resolveRuleForDate(rules, "w1", "2026-08-10")?.retentionValue).toBe(20)
    expect(resolveRuleForDate(rules.filter((r) => r.workerId === "w1"), "w1", "2026-08-10")).toBeNull()
  })
})

describe("payroll can be run for the week an estate actually pays", () => {
  const payroll = read("components/payroll-summary-tab.tsx")

  it("steps by whole weeks", () => {
    expect(payroll).toContain("shiftWeek")
    expect(payroll).toContain("weekRangeFor")
  })

  it("uses the shared week helper rather than its own date arithmetic", () => {
    // Two implementations of "which week is this" is how the payroll screen and the instalment
    // schedule end up disagreeing about which run a Saturday belongs to.
    expect(payroll).toContain('from "@/lib/payroll-period"')
  })
})
