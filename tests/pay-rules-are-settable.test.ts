import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

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
    expect(form).toContain('fetch("/api/worker-pay-rules"')
    expect(form).toContain('method: "POST"')
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
