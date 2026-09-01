import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * A worker's day cannot be booked twice.
 *
 * REPORTED BY HONEYFARM, 2026-09-01: KAB was sure he had given most people one job a day, and the
 * muster showed people on two jobs at a full day each. He was right about what he did. Every
 * morning he sets work in two batches -- one job, then the next -- and each batch used "Select all
 * present". The second tap silently re-selected the twenty-odd people the first had just given a
 * full day to.
 *
 *   27 Aug – 1 Sep: 81 worker-days booked that nobody worked. Rs 38,824.
 *
 * NOBODY TYPED A WRONG NUMBER. Two correct-looking actions composed into a wrong total, and the
 * total was the one figure never shown. This is the house failure mode -- no error, a confident
 * wrong answer -- and it is why the guard is at three levels: the database cannot store it, the
 * route explains it, and the panel does not let you walk into it.
 *
 * THE CEILING WAS 2.0 AND SHOULD NEVER HAVE BEEN. Script 116 justified it with overtime. The UI
 * then solved overtime as a pay multiplier that leaves the day at one (DAY_SHARES, "Holiday 2x"),
 * deliberately, so a block is not shown twice the labour it received -- so the client has never
 * once sent day_fraction > 1. The ceiling permitted nothing legitimate and exactly one mistake.
 */
const cap = readFileSync("scripts/145-labour-day-cap-one-day.sql", "utf8")
const route = readFileSync("app/api/attendance/assignments/route.ts", "utf8")
const panel = readFileSync("components/attendance/worker-allocation.tsx", "utf8")
const muster = readFileSync("components/attendance-tab.tsx", "utf8")

describe("the database will not store more than a day", () => {
  it("the ceiling is one day, not two", () => {
    expect(cap).toMatch(/ceiling\s+CONSTANT NUMERIC := 1\.0/)
    expect(cap).not.toMatch(/ceiling\s+CONSTANT NUMERIC := 2\.0/)
  })

  it("and caps the number of jobs at two", () => {
    expect(cap).toMatch(/max_jobs CONSTANT INTEGER := 2/)
    expect(cap).toContain("jobs + 1 > max_jobs")
  })

  it("checks siblings, excluding the row being updated", () => {
    // Without `id <> NEW.id` an ordinary edit counts itself and every correction fails.
    expect(cap).toContain("AND id <> NEW.id")
  })

  it("leaves the already-over-booked rows alone rather than rewriting a wage ledger", () => {
    expect(cap).not.toMatch(/\bDELETE FROM labour_assignments\b/)
    expect(cap).not.toMatch(/\bUPDATE labour_assignments\b/)
  })
})

describe("the panel does not let you walk into the wall", () => {
  it("defaults to half a day when the person already has work", () => {
    expect(panel).toContain("editing?.dayFraction ?? (alreadyBooked ? 0.5 : 1)")
  })

  it("disables a share that would not fit in what is left of the day", () => {
    expect(panel).toContain("const overruns = share.value > remaining + 0.0001")
    expect(panel).toContain("disabled={overruns}")
  })

  it("refuses to submit one, so the message is a sentence and not a 409", () => {
    expect(panel).toContain("if (dayFraction > remaining + 0.0001) return")
  })

  it("says what is already booked instead of leaving the total invisible", () => {
    // The whole failure was a sum nobody displayed.
    expect(panel).toContain("Two jobs in a day is half a day each")
  })
})

describe("select-all does not re-pick people who already have a full day", () => {
  it("selects the free, not everyone present", () => {
    expect(muster).toContain("presentSet.has(w.id) && !isFullyBooked(w.id)")
    expect(muster).toContain("Select all free")
    expect(muster).not.toContain(">\n                  Select all present\n")
  })

  it("adds the day up per worker, which is the number that was missing", () => {
    expect(muster).toContain("const dayUsedByWorker")
    expect(muster).toContain("const isFullyBooked")
  })

  it("an edit does not count itself when working out what is left", () => {
    expect(muster).toContain("(editingAssignment?.dayFraction ?? 0)")
  })
})

describe("the route explains the cap rather than leaking the trigger", () => {
  it("tells the writer what to do about it", () => {
    expect(route).toContain("Two jobs in a day is half a day each")
    expect(route).not.toContain("more than two days in one day")
  })
})
