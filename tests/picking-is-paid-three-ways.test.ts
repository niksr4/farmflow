import { readFileSync } from "node:fs"
import { globSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { executableSql } from "./helpers/executable-sql"

/**
 * PICKING IS PAID THREE WAYS AT ONE ESTATE, IN ONE SEASON, SOMETIMES ON ONE DAY.
 *
 * scripts/152 and docs/PICKING-PAYROLL-PLAN.md were written against one sentence from Manoj --
 * "a field is piece rate OR day wages, never both" -- and HoneyFarm contradict it:
 *
 *   permanent checkroll + casual  day rate PLUS an incentive above a threshold, still weighed
 *   arabica early fly picking     minimum wage irrespective of quantity,      still weighed
 *   assam / outside labour        straight per kilo
 *   families and contract gangs   per kilo, paid as one lump sum to the head
 *
 * Manoj's rule was not wrong, it was local. The kilos are recorded for everyone because they are
 * the crop figure; what differs is whether they are what the person is paid.
 *
 * ⚠ WHY THESE ASSERTIONS ARE WORTH HAVING. Before scripts/154 the cost view did
 * `kg_picked * rate_per_kg` for every picking row and gave all of them zero labourer-days. A
 * day-rate picker therefore cost NOTHING in the P&L and contributed no labour to the per-acre
 * figures, in the one month of the year when both peak. Neither failure throws. This file exists
 * so the arithmetic for each mode is stated somewhere a reader can check it without a database.
 *
 * The behaviour itself was proven against dev on 2026-10-11, inserting one row per mode:
 *   piece 50kg x Rs4                 -> Rs 200,  0 labourer-days
 *   daily Rs494 full day             -> Rs 494,  1 labourer-day
 *   daily Rs494 half day             -> Rs 247,  0.5
 *   incentive 50kg over 40 @ Rs3     -> Rs 524,  1
 *   incentive 30kg (below threshold) -> Rs 494,  1      <- GREATEST guard, no negative adjustment
 *   gang of 6 on a day rate          -> Rs 2964, 6 CONTRACT days
 *   gang of 6 piece (the real case)  -> Rs 1200, 0
 */

const migration = executableSql(readFileSync("scripts/154-picking-pay-modes.sql", "utf8"))

/** The picking arm only — the other two are carried over and are asserted separately below. */
const pickingArm = migration.slice(migration.lastIndexOf("UNION ALL"))

describe("a picking row says how it is paid", () => {
  it("offers exactly the three modes the estates described, and nothing invented", () => {
    const check = migration.match(/pay_mode IN \(([^)]*)\)/)
    expect(check, "pay_mode must be constrained to a known set").not.toBeNull()
    const modes = [...check![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(modes).toEqual(["daily", "daily_plus_incentive", "piece"])
  })

  it("defaults to piece, so every row that already exists keeps its meaning", () => {
    // picking_records was empty when this shipped, but the default is what guarantees that any
    // reader written against the old shape still reads the old arithmetic.
    expect(migration).toMatch(/pay_mode TEXT NOT NULL DEFAULT 'piece'/)
  })

  it("refuses a row that is half-specified for its own mode", () => {
    /**
     * THE SILENT ZERO THIS WHOLE MIGRATION EXISTS TO END. 'daily' with a NULL day_rate would
     * compute a cost of nothing and raise no error -- an estate records a day's picking, sees a
     * row, and no money moves. The constraint makes that unstorable rather than merely unlikely.
     */
    const pairs = migration.match(/CONSTRAINT picking_records_pay_mode_fields[\s\S]*?\);/)
    expect(pairs, "the per-mode field constraint must exist").not.toBeNull()
    const body = pairs![0]
    expect(body).toMatch(/WHEN 'piece'\s+THEN rate_per_kg IS NOT NULL/)
    expect(body).toMatch(/WHEN 'daily'\s+THEN day_rate IS NOT NULL/)
    expect(body).toMatch(/incentive_threshold_kg IS NOT NULL/)
    expect(body).toMatch(/incentive_rate_per_kg IS NOT NULL/)
  })

  it("lets rate_per_kg be null, because a day-rate row has no per-kg rate", () => {
    // Storing 0 instead would be a lie that computes: it multiplies out to a real-looking zero.
    expect(migration).toMatch(/ALTER COLUMN rate_per_kg DROP NOT NULL/)
  })
})

describe("the cost view reads the mode instead of assuming piece rate", () => {
  it("prices each mode with its own expression, in ONE place", () => {
    /**
     * The arithmetic lives on the generated column, not in the view and not in the route. Before
     * this, /api/picking-records computed `kg_picked * rate_per_kg` in two more places -- a row
     * list and a summary SUM -- both of which return nothing for a day-rate row. Three copies of
     * a formula is the contract-in-two-places shape that has already cost this codebase three
     * silent bugs, and it would defeat the entire point of pay_mode.
     */
    const gen = migration.match(/total_cost NUMERIC\(14,2\)[\s\S]*?STORED;/)
    expect(gen, "total_cost must be generated from the row's own parts").not.toBeNull()
    const body = gen![0]
    expect(body).toMatch(/WHEN 'piece' THEN COALESCE\(kg_picked, 0\) \* COALESCE\(rate_per_kg, 0\)/)
    expect(body).toMatch(/WHEN 'daily' THEN COALESCE\(day_rate, 0\) \* headcount \* day_fraction/)
    expect(body).toContain("STORED")
  })

  it("has the view READ that column rather than restate it", () => {
    expect(pickingArm).toMatch(/p\.total_cost\s+AS total_cost/)
    // The formula must appear nowhere inside the view arm.
    expect(pickingArm).not.toMatch(/kg_picked, 0\) \* COALESCE\(p?\.?rate_per_kg/)
  })

  it("pays the incentive only on the kilos above the threshold, and never negatively", () => {
    // A picker who misses the threshold gets the day rate, not the day rate minus something.
    // Dad, on a bad day: they are "paid minimum wage nevertheless".
    expect(migration).toMatch(/GREATEST\(0, COALESCE\(kg_picked, 0\) - /)
  })

  it("scales the threshold by headcount, because the day rate it sits beside is per person", () => {
    /**
     * THE UNITS HAVE TO MATCH AND NEARLY DID NOT. day_rate is multiplied by headcount on the line
     * above, so it is a per-person figure; kg_picked on a crew row is the whole crew's kilos. A
     * per-ROW threshold would make one expression speak both languages:
     *
     *   family of 6, 300 kg, 40 kg threshold at Rs 3
     *     per-row threshold   (300 - 40)   x 3 = Rs 780
     *     per-person (meant)  (300 - 6x40) x 3 = Rs 180
     *
     * Nothing raises an error either way, and an individual is identical because headcount is 1 --
     * so the overpayment would only ever appear on crew rows, which is where nobody is checking.
     */
    expect(migration).toMatch(/COALESCE\(incentive_threshold_kg, 0\) \* headcount/)
  })

  it("counts a labourer-day for a day rate and none for a kilo", () => {
    /**
     * scripts/122 gave ALL picking zero labourer-days, reasoning that "a kilo is not a day". That
     * is right for piece rate and wrong for a day rate, and labourer-days per acre is what the
     * INDICOFS reporting and the per-acre analysis rest on -- so the old behaviour under-counted
     * labour in the busiest weeks of the year.
     */
    expect(pickingArm).toMatch(/p\.pay_mode = 'piece'[\s\S]{0,80}THEN 0/)
    expect(pickingArm).toMatch(/ELSE p\.headcount \* p\.day_fraction END\s+AS estate_laborers/)
  })

  it("routes a gang to contract labour, the same way the muster's own arm does", () => {
    // Two arms of one view disagreeing about what a gang is would make a per-acre figure
    // unexplainable. In practice this branch is quiet -- gangs are paid per kilo -- but the rule
    // must not depend on that staying true.
    expect(pickingArm).toMatch(/w\.kind = 'gang'/)
    expect(pickingArm).toMatch(/JOIN attendance_workers w/)
  })

  it("keeps security_invoker, and refuses to finish without it", () => {
    /**
     * scripts/148 learned this the hard way: a labour_cost rebuilt without security_invoker runs
     * as its owner and bypasses RLS, so every tenant's labour cost becomes readable by anybody.
     * Stated on the view AND asserted at the end of the migration, because a silent loss here is
     * a cross-tenant data leak rather than a broken screen.
     */
    expect(migration).toMatch(/CREATE OR REPLACE VIEW labour_cost\s*\nWITH \(security_invoker = true\)/)
    expect(migration).toMatch(/RAISE EXCEPTION[\s\S]{0,200}security_invoker/)
  })
})

describe("the two arms it did not mean to touch", () => {
  /**
   * ⚠ THE FAILURE THIS CATCHES ALREADY HAPPENED ONCE, while writing this migration. The first
   * draft reproduced the assignment arm from memory as
   * `CASE WHEN la.lump_sum IS NULL THEN ... END AS estate_laborers`, which silently dropped the
   * gang/contract split that scripts/122 actually ships. It was caught by diffing the rebuilt view
   * on dev against the live definition on production, arm by arm -- not by reading it.
   *
   * scripts/148 says it outright: "retyping it into a migration to change a column width somewhere
   * else is how a definition quietly drifts from the one that was tested."
   */
  it("carries the transaction arm over verbatim, cutover clause included", () => {
    expect(migration).toMatch(/FROM labor_transactions lt\s+WHERE NOT EXISTS/)
    expect(migration).toMatch(/lt\.deployment_date >= m\.assignments_from/)
  })

  it("carries the assignment arm over WITH its gang split intact", () => {
    for (const col of ["estate_laborers", "estate_rate", "contract_laborers", "contract_rate"]) {
      expect(
        migration,
        `the assignment arm's ${col} must keep its gang/individual split`,
      ).toMatch(new RegExp(`CASE WHEN w\\.kind = 'gang' THEN[^\\n]*AS ${col}`))
    }
    expect(migration).toMatch(/a\.work_date >= m\.assignments_from/)
  })

  it("replaces rather than drops, so estate_cost does not have to come down with it", () => {
    // estate_cost SELECTs FROM labour_cost (scripts/148). The column list, names, types and order
    // are unchanged here -- only two expressions differ -- so a replace is legal and the dependent
    // view is untouched.
    expect(migration).toContain("CREATE OR REPLACE VIEW labour_cost")
    expect(migration).not.toMatch(/DROP VIEW\s+(IF EXISTS\s+)?labour_cost/)
    expect(migration).not.toMatch(/DROP VIEW\s+(IF EXISTS\s+)?estate_cost/)
  })
})

describe("ripe and green, where the estate separates them", () => {
  it("keeps them nullable, because the dry route never measures them", () => {
    /**
     * Dad, on the two routes:
     *   washed    "Ripe and green are recorded separately."
     *   dry       "red and green are not segregated or weighed separately; only total pick"
     *
     * Defaulting to 0 would record a measurement nobody took -- "they picked no ripe cherry" --
     * which is the difference between absent and zero that this codebase keeps having to relearn.
     */
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS kg_ripe\s+NUMERIC/)
    expect(migration).not.toMatch(/kg_ripe\s+NUMERIC\([^)]*\)\s+NOT NULL/)
    expect(migration).not.toMatch(/kg_ripe[^\n]*DEFAULT 0/)
  })

  it("requires both or neither, and requires them to agree with the total", () => {
    const c = migration.match(/CONSTRAINT picking_records_ripe_green_sum[\s\S]*?\);/)
    expect(c).not.toBeNull()
    expect(c![0]).toMatch(/kg_ripe IS NULL AND kg_green IS NULL/)
    expect(c![0]).toMatch(/ABS\(\(kg_ripe \+ kg_green\) - kg_picked\) <= 0\.001/)
  })

  it("leaves kg_picked as the one number meaning 'what this person picked'", () => {
    // The split is additional detail, not a replacement, so nothing downstream has to learn about
    // it: the piece-rate price and the incentive threshold both still read kg_picked, and no
    // reader is asked to add two columns together to find out what somebody picked.
    expect(migration).toMatch(/WHEN 'piece' THEN COALESCE\(kg_picked, 0\) \* COALESCE\(rate_per_kg, 0\)/)
    expect(migration).toMatch(/COALESCE\(kg_picked, 0\) - COALESCE\(incentive_threshold_kg, 0\)/)
    expect(migration).not.toMatch(/kg_ripe \+ kg_green\) \* /)
  })
})

describe("every reader of a picking row asks the row what it cost", () => {
  /**
   * ⚠ THE SWEEP THAT SHOULD HAVE HAPPENED WHEN pay_mode WAS ADDED, and did not.
   *
   * Making rate_per_kg nullable fixed the cost view and the picking route, and left
   * payroll-summary and reconciliation still computing SUM(kg_picked * rate_per_kg). On a
   * day-rate row that product is NULL, SUM SKIPS NULLS, and the picker's wages simply vanish from
   * payroll -- no error, no zero, just a smaller number. Found by CodeRabbit, not by me, on a PR
   * whose entire subject was that this arithmetic had moved.
   *
   * Derived rather than listed: this finds every file that reads the table and checks that file,
   * so a consumer written next season is covered next season. A hand-kept list of two is exactly
   * how the third instance hides.
   */
  const readers = globSync("{app,lib,components}/**/*.{ts,tsx}").filter((f) =>
    readFileSync(f, "utf8").includes("picking_records"),
  )

  it("finds the readers at all, so this guard cannot pass by scanning nothing", () => {
    // A derived set that silently becomes empty is a test that always passes.
    expect(readers.length).toBeGreaterThan(0)
  })

  it("has none of them price a picking row themselves", () => {
    const offenders = readers.filter((f) => {
      const src = readFileSync(f, "utf8")
      // Shape, not identifiers: any multiplication of a picked weight by a per-kg rate, in either
      // order, with or without a table alias.
      return /kg_picked\s*\*\s*(\w+\.)?rate_per_kg|(\w+\.)?rate_per_kg\s*\*\s*(\w+\.)?kg_picked/.test(src)
    })
    expect(
      offenders,
      "these price a picking row instead of reading total_cost, so day-rate wages vanish from their totals",
    ).toEqual([])
  })
})
