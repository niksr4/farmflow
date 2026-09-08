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
  // worker_ledger is deliberately absent from this list as of 2026-09-08 -- see the block below.
]

/**
 * The source that currently has NO screen, stated rather than quietly dropped.
 *
 * components/worker-ledger-tab.tsx was deleted on 2026-09-08. That is a decision, not a
 * regression: its three jobs move to Workers and Payroll (docs/PAYROLL-RULES-PLAN.md). But the
 * decision does not change the arithmetic -- payroll still sums `worker_ledger`, and right now
 * nothing renders a way to write it.
 *
 * That is the precise state this whole file exists to catch, so removing the entry from SOURCES
 * and moving on would be the file deleting its own point. It is named here instead, with the thing
 * that has to exist before it goes back in the list above.
 */
const SOURCE_AWAITING_A_SCREEN = {
  table: "worker_ledger",
  writtenBy: "app/api/worker-ledger/route.ts",
  plannedScreen: "components/workers/worker-money-panel.tsx",
  plan: "docs/PAYROLL-RULES-PLAN.md",
}

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
    // Still a source, still summed, still counted -- just without a screen for the moment.
    expect(payroll).toContain(SOURCE_AWAITING_A_SCREEN.table)
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

  it("worker_ledger still has a route that writes it, even with no screen", () => {
    // The way in is gone; the way through is not. If this ever fails, the table is unreachable
    // from both ends and payroll is summing something nothing can produce.
    const route = read(SOURCE_AWAITING_A_SCREEN.writtenBy)
    expect(route).toMatch(new RegExp(`INSERT INTO\\s+${SOURCE_AWAITING_A_SCREEN.table}`))
  })

  it("says out loud that worker_ledger has no screen, and where the replacement is going", () => {
    /**
     * THIS TEST IS SUPPOSED TO BE UNCOMFORTABLE. Payroll deducts from a table a human cannot
     * currently write to. That was true from 2026-07-25 to 2026-09-08 by accident, behind a
     * forgotten flag, and the resulting emptiness got written into STATUS.md as a product signal.
     * It is true again now on purpose, for a few days, while the entry points move to Workers.
     *
     * The difference between the two is entirely whether it is written down, so that is what is
     * asserted: the deletion has a date, a reason, and a named file it is waiting on.
     */
    const workspace = read("components/attendance-workspace.tsx")
    expect(workspace, "the deletion needs a date").toMatch(/THE LEDGER IS GONE, \d{4}-\d{2}-\d{2}/)
    expect(workspace, "and the plan it is waiting on").toContain(SOURCE_AWAITING_A_SCREEN.plan)
    expect(workspace, "and the screen that replaces it").toContain("MONEY PANEL")
  })

  it("goes back in SOURCES the moment that panel exists", () => {
    /**
     * A self-deleting exemption. The moment components/workers/worker-money-panel.tsx is created,
     * this fails and whoever added it has to move worker_ledger back into SOURCES above -- where
     * the normal "has a screen" assertion applies to it again.
     *
     * Without this, the exemption outlives its reason, which is exactly how LEDGER_TAB_DISABLED
     * survived six weeks.
     */
    let panelExists = true
    try {
      read(SOURCE_AWAITING_A_SCREEN.plannedScreen)
    } catch {
      panelExists = false
    }
    expect(
      panelExists,
      `${SOURCE_AWAITING_A_SCREEN.plannedScreen} now exists — move worker_ledger back into SOURCES and delete this test`,
    ).toBe(false)
  })
})

describe("the muster workspace does not hide a section behind a dead switch", () => {
  const workspace = read("components/attendance-workspace.tsx")

  /**
   * THE LEDGER IS OFF AGAIN as of 2026-09-03, and this block now asserts that honestly rather than
   * asserting it is on.
   *
   * It was re-enabled that morning on a data-path check, and crashed on the first click: the real
   * cause was `<SelectItem value="">`, not the date-serialisation bug already fixed in the route.
   * Both are now fixed and tests/no-empty-select-item.test.ts stops a third appearing — what has
   * not happened is a human opening the screen, which is precisely the step that was skipped.
   *
   * Weakening the assertion to "the ledger is optional" would throw away the lesson. Instead the
   * rule is: a section may be absent, but the absence must be explained IN PLACE, with a date and
   * a way back. The original LEDGER_TAB_DISABLED had none of those and cost six weeks.
   */
  it("a section that is absent says why and when — whether it is hidden or deleted", () => {
    // Two legitimate end states, one rule. Hidden needs a way back; deleted needs a reason. What
    // is never acceptable is a section that is simply not there, which is what July looked like.
    const ledgerInNav = workspace.includes('label: "Ledger"')
    if (ledgerInNav) return // back on; nothing to explain
    expect(workspace, "the Ledger is absent with no dated explanation").toMatch(
      /THE LEDGER IS (OFF AGAIN|GONE), \d{4}-\d{2}-\d{2}/,
    )
    const isDeleted = workspace.includes("THE LEDGER IS GONE")
    if (isDeleted) {
      expect(workspace, "a deletion has to say what replaced it").toContain("WHAT IS LOST")
    } else {
      expect(workspace, "a hidden section needs a stated route back").toContain("TO RESTORE:")
    }
  })

  it("the old flag stays gone — a hidden section is a deletion, not a switch", () => {
    // At `= false` it is one keystroke from switching itself back on and the comment explaining it
    // rots in place. Removing the nav entry outright leaves the reasoning where someone will read
    // it, which is the whole difference between this removal and the one in July.
    //
    // COMMENTS STRIPPED FIRST. This failed on 2026-09-08 against a comment that *named* the flag
    // while explaining why it was a mistake -- the same trap tests/no-empty-select-item.test.ts
    // hit on its first run. A guard that cannot tell code from the prose describing it punishes
    // documenting the bug, and gets deleted by whoever trips over it next.
    const code = workspace.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toContain("LEDGER_TAB_DISABLED")
  })

  it("no section of the workspace is gated on a constant that is always false", () => {
    // The shape, not the name: any `const X_DISABLED = true` here hides a screen from everyone,
    // and the next one will be found the same way that one was — six weeks late, by accident.
    expect(workspace).not.toMatch(/const\s+\w*_DISABLED\s*=\s*true/)
  })

  it("every section still in the nav has somewhere to render", () => {
    // A value in the union with no branch is a tab that navigates to nothing.
    for (const s of ["attendance", "workers", "payroll", "report", "scanner"]) {
      expect(workspace, `no render branch for the "${s}" section`).toContain(`activeSection === "${s}"`)
    }
  })
})
