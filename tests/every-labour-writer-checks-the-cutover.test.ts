import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

/**
 * EVERY ROUTE THAT WRITES `labor_transactions` MUST CHECK THE CUTOVER.
 *
 * `labour_cost`'s legacy arm excludes a row dated on or after the tenant's
 * `tenant_labour_entry_mode.assignments_from`:
 *
 *     NOT EXISTS (… WHERE deployment_date >= m.assignments_from)
 *
 * So such a row is written, reported as saved, and then **absent from every labour total in the
 * app** — the Costs list, accounts-summary, accounts-totals, the balance sheet, ai-charts-data,
 * intelligence-brief. Money entered and counted nowhere, which is verbatim the outcome
 * `lib/server/labour-entry-mode.ts` says it exists to prevent.
 *
 * ⚠ BOTH `/api/labor-neon` PATHS GUARDED IT AND `import-bulk` DID NOT. Found by the 2026-10-16
 * muster audit. Not an edge case either: **all four live tenants have a cutover in August 2026**,
 * so any labour CSV imported after that date vanished completely, and HoneyFarm's 1,024 legacy
 * rows show imports do happen. Reachable by every estate's own admin.
 *
 * This is the third time in one week that fixing one instance of a class left its siblings:
 * #85 gave picking an edit route and #93 then found two more routes with no day-cap mapping;
 * #98 found fields the edit route accepted and never rendered. So this guard is derived from the
 * SQL rather than from a list, and a fourth writer is covered on the day it is added.
 */

const ROUTES = execFileSync("git", ["ls-files", "app"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith("route.ts"))

/** ⚠ Comments stripped: this file's own prose quotes the SQL it looks for. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

/** Routes that INSERT the legacy labour table, found by their SQL, not named here. */
const WRITERS = ROUTES.filter((f) =>
  /INSERT INTO\s+labor_transactions\b/.test(stripComments(readFileSync(f, "utf8"))),
)

describe("no labour row can be written past its tenant's cutover", () => {
  it("found the writers by their SQL, so this cannot pass vacuously", () => {
    expect(WRITERS.length).toBeGreaterThanOrEqual(2)
    expect(WRITERS).toContain("app/api/labor-neon/route.ts")
    expect(WRITERS).toContain("app/api/import-bulk/route.ts")
  })

  /**
   * ⚠ ONE EXEMPTION, AND IT HAS TO EARN ITS PLACE. `admin/seed-tenant` fabricates demo history and
   * that history is DELIBERATELY pre-cutover legacy data -- blocking it on the cutover would break
   * seeding outright. My derived scan found it, which is the scan working: I did not know it wrote
   * this table.
   *
   * The exemption is only defensible because #100 restricted seeding to an allow-list of demo
   * tenants. So the test below asserts that restriction still exists: if somebody widens seeding
   * back to real estates, this exemption stops being safe AND this test fails, instead of quietly
   * permitting unguarded legacy writes at a paying tenant. A free pass that cannot notice when it
   * stops being deserved is how the next hole opens.
   */
  const EXEMPT: Record<string, string> = {
    "app/api/admin/seed-tenant/route.ts":
      "seeds demo history that is deliberately pre-cutover; safe only while seeding is restricted to demo tenants",
  }

  it("keeps the one exemption honest -- seeding must still be demo-only", () => {
    const seed = stripComments(readFileSync("app/api/admin/seed-tenant/route.ts", "utf8"))
    expect(
      /!\s*DEMO_TENANTS\.includes\(/.test(seed),
      "seed-tenant is exempt from the cutover check only because it cannot touch a real estate. " +
        "That allow-list is gone, so the exemption is no longer safe -- either restore it or make " +
        "seeding check the cutover.",
    ).toBe(true)
    expect(Object.values(EXEMPT)[0].length).toBeGreaterThan(30)
  })

  it("has every one of them call blockedByLabourCutover", () => {
    const unguarded = WRITERS.filter((f) => {
      if (f in EXEMPT) return false
      const body = stripComments(readFileSync(f, "utf8"))
      // The CALL, not the import -- `toContain("blockedByLabourCutover")` passes on the import
      // line alone, which is how a guard against a real bug goes vacuous in this repo.
      return !/blockedByLabourCutover\s*\(/.test(body)
    })
    expect(
      unguarded,
      "these routes write labor_transactions without checking the cutover, so a row dated after " +
        "it is saved, acknowledged, and absent from every labour total. Call " +
        "blockedByLabourCutover from lib/server/labour-entry-mode.ts.",
    ).toEqual([])
  })

  it("checks the date of the row being written, not just that a guard exists", () => {
    // A call passing the wrong thing -- today's date, or nothing -- would satisfy the test above
    // while guarding nothing. Each writer must hand it the date it is about to store.
    const importer = stripComments(readFileSync("app/api/import-bulk/route.ts", "utf8"))
    expect(importer).toMatch(/blockedByLabourCutover\(\s*tenantContext\s*,\s*deploymentDate\s*\)/)

    const neon = stripComments(readFileSync("app/api/labor-neon/route.ts", "utf8"))
    expect(neon).toMatch(/blockedByLabourCutover\(\s*tenantContext\s*,\s*body\?\.date\s*\)/)
  })

  it("refuses the row rather than the whole import", () => {
    /**
     * A back-log CSV can legitimately straddle the cutover — the pre-cutover rows should still
     * land. So the importer checks per row and pushes the guard's own sentence into `errors`,
     * which tells the writer which lines were skipped and why. Failing the entire upload would
     * make a mixed file unimportable.
     */
    const importer = stripComments(readFileSync("app/api/import-bulk/route.ts", "utf8"))
    const guardAt = importer.search(/blockedByLabourCutover\(/)
    const after = importer.slice(guardAt, guardAt + 400)
    expect(after).toMatch(/errors\.push/)
    expect(after).toMatch(/continue/)
  })
})
