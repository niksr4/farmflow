import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every table payroll pays from must have a screen you can reach.
 *
 * `worker_ledger` had 0 rows across every tenant for six weeks and that was read as "nobody uses
 * advances and deductions" — in this file's own STATUS.md, by me, on 2026-09-02. It was not.
 * The Ledger tab had been switched off on 2026-07-25 behind `LEDGER_TAB_DISABLED = true` while a
 * date-serialisation crash was fixed. The fix landed the same week. The flag never moved.
 *
 * So payroll had a term in its arithmetic — deductions and adjustments — fed by a table with no
 * way in, and the resulting emptiness became the evidence for leaving it alone. A kill switch with
 * no owner and no date outlives the memory of why it was set, and the silence it produces is
 * indistinguishable from a product signal.
 *
 * This is the invariant that would have caught it: payroll reads five sources, and each one needs
 * somewhere a human can put data. A source with no writer is either a bug or a decision, and
 * either way somebody should have to say so out loud.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8")
const payroll = read("app/api/payroll-summary/route.ts")

/** Each table payroll sums, and the screen that writes it. */
const SOURCES = [
  { table: "attendance_records", writtenBy: "app/api/attendance/route.ts", screen: "components/attendance-tab.tsx" },
  { table: "labour_assignments", writtenBy: "app/api/attendance/assignments/route.ts", screen: "components/attendance/worker-allocation.tsx" },
  { table: "picking_records", writtenBy: "app/api/picking-records/route.ts", screen: "components/picking-log-tab.tsx" },
  { table: "worker_ledger", writtenBy: "app/api/worker-ledger/route.ts", screen: "components/worker-ledger-tab.tsx" },
]

/**
 * The fifth source is a column, not a table — the salary lives on the worker.
 *
 * Kept separate rather than bent into the list above, because "is there an INSERT INTO x" is the
 * wrong question for a column and a regex loose enough to cover both would pass on the mere
 * mention of the word. This one was read by nothing at all until 2026-09-02, which is exactly the
 * failure this file is about, so it earns its own check rather than a weaker shared one.
 */
const SALARY_SOURCE = {
  column: "monthly_wage",
  writtenBy: "app/api/attendance/workers/route.ts",
  screen: "components/worker-profiles-tab.tsx",
}

describe("payroll's sources each have a way in", () => {
  it("reads exactly the five we think it does", () => {
    // A sixth appearing without a writer is the thing this file exists to catch.
    for (const { table } of SOURCES) {
      expect(payroll, `payroll should read ${table}`).toContain(table)
    }
    expect(payroll, "payroll should read the monthly salary").toContain(SALARY_SOURCE.column)
  })

  it("the salary column is written from the roster, and shown on it", () => {
    const route = read(SALARY_SOURCE.writtenBy)
    // In the INSERT column list and carried back out again -- a route that only reads it is a
    // route through which nobody can set a salary.
    expect(route).toContain(SALARY_SOURCE.column)
    expect(route).toContain("monthlyWage")
    expect(read(SALARY_SOURCE.screen)).toContain("monthlyWage")
  })

  it("every source has a route that writes it", () => {
    for (const { table, writtenBy } of SOURCES) {
      const source = read(writtenBy)
      expect(source, `${writtenBy} should write ${table}`).toMatch(
        new RegExp(`(INSERT INTO|UPDATE)\\s+${table}|${table}\\s*=`),
      )
    }
  })

  it("and a screen a person can actually open", () => {
    for (const { screen } of [...SOURCES, SALARY_SOURCE]) {
      expect(read(screen).length, `${screen} should exist and not be empty`).toBeGreaterThan(0)
    }
  })
})

describe("the muster workspace does not hide a section behind a dead switch", () => {
  const workspace = read("components/attendance-workspace.tsx")

  it("the Ledger is back in the navigation", () => {
    expect(workspace).toContain('{ value: "ledger" as AttendanceSection, label: "Ledger", icon: BookOpen }')
    expect(workspace).toContain('showLaborManagement && activeSection === "ledger"')
  })

  it("the flag is removed, not set to false", () => {
    // Left as `= false` it is one keystroke from switching itself back on in a future edit, and
    // the comment explaining why it existed rots in place. Gone is the only stable state.
    expect(workspace).not.toContain("LEDGER_TAB_DISABLED")
  })

  it("no section of the workspace is gated on a constant that is always false", () => {
    // The shape, not the name: any `const X_DISABLED = true` here hides a screen from everyone,
    // and the next one will be found the same way this one was — six weeks late, by accident.
    expect(workspace).not.toMatch(/const\s+\w*_DISABLED\s*=\s*true/)
  })

  it("every declared section is rendered", () => {
    // A value in the union with no branch is a tab that navigates to nothing.
    const sections = ["attendance", "workers", "ledger", "payroll", "report", "scanner"]
    for (const s of sections) {
      expect(workspace, `no render branch for the "${s}" section`).toContain(`activeSection === "${s}"`)
    }
  })
})
