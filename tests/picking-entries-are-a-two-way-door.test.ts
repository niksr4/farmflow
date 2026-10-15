import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * WHATEVER A WRITER CAN ENTER, A WRITER MUST BE ABLE TO CORRECT.
 *
 * The picking edit route predated the pay modes (scripts/154) and still only knew kg, rate-per-kg,
 * date, block and notes -- while the form loaded every field for editing and offered them back.
 * Three failures came out of that gap, all reproduced against dev before the fix:
 *
 *   1. editing the weight on a row with a ripe/green split returned HTTP 500, because kg_picked
 *      moved and kg_ripe/kg_green did not, and picking_records_ripe_green_sum requires they add up
 *   2. a wrong day rate could not be corrected at all -- day_rate was not in the schema, so the
 *      only remedy was delete-and-retype
 *   3. editing a daily row wrote rate_per_kg = 0, because the client sent
 *      `Number(editForm.ratePerKg)` on a field that is empty for day-rate rows and Number("") is 0.
 *      On a piece row whose rate had been cleared, that made the day free labour.
 *
 * ⚠ THE SET OF EDITABLE COLUMNS IS DERIVED FROM THE TABLE, not listed by hand. A hand-kept list is
 * what let the pay-mode columns ship without edit support in the first place: seven columns were
 * added by a migration and nobody thought to revisit the PUT. Anything added tomorrow is covered
 * tomorrow, or this fails.
 */

const ROUTE = readFileSync("app/api/picking-records/[id]/route.ts", "utf8")

/**
 * Just the zod schema that decides what a PUT is allowed to carry.
 *
 * ⚠ SCOPED, BECAUSE THE WHOLE-FILE VERSION WAS VACUOUS. Searching the entire route for `dayRate:`
 * passed even with `dayRate` deleted from the schema -- the name still appears further down in the
 * merge logic and in the pickingRowProblem call. A tamper that reproduced the exact original bug
 * sailed through. The schema is the only place that controls what a caller may change.
 */
const UPDATE_SCHEMA = (() => {
  const start = ROUTE.indexOf("const updateSchema = z.object({")
  const end = ROUTE.indexOf("})", start)
  if (start === -1 || end === -1) throw new Error("could not locate updateSchema in the edit route")
  return ROUTE.slice(start, end)
})()
const MIGRATION = readFileSync("scripts/154-picking-pay-modes.sql", "utf8")
const TAB = readFileSync("components/picking-log-tab.tsx", "utf8")

/** Columns scripts/154 added to picking_records, read from the migration rather than typed here. */
const PAY_MODE_COLUMNS = [...MIGRATION.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map((m) => m[1])

/** snake_case to the camelCase the API speaks. */
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

/**
 * Columns a correction must never move, with the reason. Not an escape hatch -- each one has to be
 * defensible, and the test below fails if one stops existing, so the list cannot rot quietly.
 */
const INTENTIONALLY_IMMUTABLE: Record<string, string> = {
  headcount:
    "copied from the roster at entry time so a gang later changing size cannot rewrite what last month cost",
  total_cost: "GENERATED ALWAYS -- it is the row's own arithmetic, not a field",
}

describe("every pay-mode column a writer can enter, they can also correct", () => {
  it("found the columns in the migration, so this cannot pass by checking nothing", () => {
    expect(PAY_MODE_COLUMNS.length).toBeGreaterThanOrEqual(7)
    expect(PAY_MODE_COLUMNS).toContain("day_rate")
    expect(PAY_MODE_COLUMNS).toContain("pay_mode")
    expect(PAY_MODE_COLUMNS).toContain("kg_ripe")
  })

  it("has every one of them in the edit route's schema, or deliberately immutable", () => {
    const missing = PAY_MODE_COLUMNS.filter((col) => {
      if (col in INTENTIONALLY_IMMUTABLE) return false
      // Keyed on the schema field, not a mention anywhere in the file -- a column named only in a
      // comment is exactly the state this test exists to reject.
      return !new RegExp(`\\b${camel(col)}\\s*:`).test(UPDATE_SCHEMA)
    })
    expect(
      missing,
      "these columns can be entered but not corrected, so fixing one means deleting the row and retyping it",
    ).toEqual([])
  })

  it("keeps every immutable column genuinely immutable, and for a stated reason", () => {
    for (const [col, why] of Object.entries(INTENTIONALLY_IMMUTABLE)) {
      // If it stops being a real column the exemption is stale and should be removed, not kept.
      expect(
        MIGRATION.includes(col) || col === "total_cost",
        `${col} is exempted from editing but is no longer a column that 154 adds`,
      ).toBe(true)
      expect(why.length).toBeGreaterThan(20)
    }
    // headcount must NOT be settable from the request body.
    expect(/headcount\s*:/.test(UPDATE_SCHEMA), "headcount became editable; a crew size is a cost multiplier").toBe(false)
  })
})

describe("an edit the database would refuse comes back as a sentence, not a 500", () => {
  it("validates the merged row with the same rule the insert uses", () => {
    // pickingRowProblem, called -- not merely imported. Without this the ripe/green mismatch and
    // the half-specified incentive surface as CHECK violations in the generic 500 branch.
    expect(ROUTE).toMatch(/pickingRowProblem\s*\(/)
    expect(ROUTE).toMatch(/status:\s*400/)
  })

  it("treats the day cap as a refusal (409), not a fault", () => {
    // scripts/152 raises from a trigger when an edit would push a worker past a full day across
    // picking and day-work. That is something the writer can act on.
    // DAY_CAP_STATUS is 409. The literal moved into lib/server/day-cap-refusal.ts when the create
    // and muster routes were found to have NO mapping at all -- see
    // tests/day-cap-is-a-refusal-not-a-fault.test.ts, which now checks all three writers.
    expect(ROUTE).toMatch(/DAY_CAP_STATUS|status:\s*409/)
  })

  it("distinguishes 'not sent' from 'cleared', so an edit cannot silently drop a field", () => {
    // `undefined` means leave it; an explicit null means clear it. Collapsing the two is how the
    // old route lost every field it did not know about.
    expect(ROUTE).toMatch(/sent === undefined/)
  })
})

describe("the form sends what it shows", () => {
  it("builds the add and edit payloads from ONE function", () => {
    /**
     * They were two literals and the edit one carried five of the twelve fields. A shared builder
     * is the only thing that stops them drifting again.
     */
    // Defined once...
    expect(TAB).toMatch(/const toPickingPayload = /)
    // ...and CALLED twice: once by the add path, once by the edit path. Keyed on the call site, so
    // the definition itself cannot satisfy it -- that is how a helper gets written, left unused,
    // and the old literal keeps shipping.
    const calls = [...TAB.matchAll(/toPickingPayload\(/g)]
    expect(calls.length, "both the add and the edit path must use the shared builder").toBe(2)
  })

  it("never turns an empty field into a zero rate", () => {
    /**
     * `Number("")` is 0. On a piece row whose rate the writer cleared, that stored a rate of zero
     * and the day became free labour while still showing a weight -- a confident wrong number with
     * no error, which is this codebase's signature failure.
     */
    expect(TAB).not.toMatch(/ratePerKg:\s*Number\(editForm\.ratePerKg\)/)
    // The mode decides whether the field is used at all; unused fields go as null.
    expect(TAB).toMatch(/ratePerKg:\s*f\.payMode === "piece" \? Number\(f\.ratePerKg\) : null/)
    expect(TAB).toMatch(/kgRipe:\s*f\.kgRipe === "" \? null : Number\(f\.kgRipe\)/)
  })

  it("renders an input for every field the edit payload sends", () => {
    /**
     * ⚠ THE FIELDS WERE LOADED AND SENT ALL ALONG -- ONLY THE INPUTS WERE MISSING, and nothing
     * could see that. `editForm` carried kgRipe/kgGreen, `toPickingPayload` sent them, and the
     * schema accepted them, so every existing guard passed while the writer had no field on screen.
     * Correcting 50 kg to 60 kg on a split row was refused by the client -- "Ripe and green add up
     * to 50.0 kg, but the total picked is 60.0 kg" -- with no way to make it add up. 63% of dev
     * picking rows carry a split and HoneyFarm's washed route records them separately.
     *
     * Keyed on the EDIT row specifically: the add form has always had these inputs, so a
     * whole-file search for the name passes on the wrong one. The edit row is the block that
     * reads from `editForm`.
     */
    const editRow = (() => {
      const start = TAB.indexOf("editingId === r.id")
      if (start === -1) throw new Error("could not locate the edit row")
      return TAB.slice(start, start + 4000)
    })()
    for (const field of ["kgRipe", "kgGreen"]) {
      expect(
        new RegExp(`value=\\{numericInputValue\\(editForm\\.${field}\\)`).test(editRow),
        `the edit row sends ${field} but renders no input for it, so a split row's weight cannot ` +
          `be corrected at all -- only deleted and retyped`,
      ).toBe(true)
    }
  })

  it("checks the edit before the round trip, as the add path does", () => {
    expect(TAB).toMatch(/editProblem/)
  })
})
