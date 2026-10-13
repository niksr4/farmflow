import { readFileSync } from "node:fs"
import { globSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * A PICKED DAY MUST NOT ALSO BE BILLED AS AN ATTENDANCE DAY.
 *
 * Three tables can each describe the same worker-day and two of them carry money:
 *
 *   attendance_records    they were here            (presence, no cost of its own)
 *   labour_assignments    what work they did        (costed, and in labour_cost)
 *   picking_records       what they picked          (costed, and in labour_cost)
 *
 * scripts/152 keeps the DAY honest -- picking and day-work share one budget, so the fractions
 * cannot exceed 1.0 across both tables. That stops a day being *booked* twice. It does nothing
 * about a day being *paid* twice by a reader that adds picking to an attendance-derived figure,
 * and two readers did exactly that:
 *
 *   /api/payroll-summary   net = picking + COALESCE(salary, muster, days_present x daily_rate)
 *   /api/reconciliation    payrollCost = attendance_cost + picking_cost
 *
 * Both fall back to attendance x rate when a worker has no muster assignment -- and a worker who
 * picked all day has no muster assignment, because the day budget REFUSED one. So every full
 * picking day was paid twice. Measured on dev: Rs 694 for a day that cost Rs 200.
 *
 * ⚠ PRE-EXISTING AND LATENT. Both were on main before any of the pay-mode work, harmless only
 * because picking_records held zero rows on every tenant. Building the picking form is what makes
 * them real money, which is why they are fixed with it.
 */

const PAYROLL_READERS = globSync("app/api/**/route.ts").filter((f) => {
  const src = readFileSync(f, "utf8")
  /**
   * Only readers that turn attendance into MONEY and also count picking.
   *
   * Keyed on the multiplication, not on the mention. An earlier version matched any file naming
   * daily_rate or days_present, which swept in /api/attendance -- it reads picking_records purely
   * to warn "this worker was paid by weight today" on the muster and multiplies nothing. Flagging
   * it would have meant either a false failure or an exemption list, and an exemption list is how
   * the next real instance hides.
   */
  if (!src.includes("picking_records")) return false
  // Either order, and tolerant of COALESCE(...) wrapping either side -- payroll-summary writes
  // `COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0)`, so the two names are never
  // adjacent to the operator.
  return /(days_present|uncosted_days)[^;]{0,60}\*[^;]{0,60}daily_rate|daily_rate[^;]{0,60}\*[^;]{0,60}(days_present|uncosted_days)/.test(src)
})

describe("no reader pays for the same picked day twice", () => {
  it("finds the readers at all, so this cannot pass by scanning nothing", () => {
    // A derived set that silently empties is a test that always passes. Both known offenders must
    // be in here.
    expect(PAYROLL_READERS.length).toBeGreaterThan(0)
    expect(PAYROLL_READERS).toContain("app/api/payroll-summary/route.ts")
    expect(PAYROLL_READERS).toContain("app/api/reconciliation/route.ts")
  })

  it("has every one of them exclude picked days from its attendance fallback", () => {
    /**
     * Keyed on the SHAPE of the exclusion, not on one spelling: a NOT EXISTS against
     * picking_records correlated on the attendance date. That is the only way to say "this day is
     * already paid" and it is what both fixes do.
     */
    const offenders = PAYROLL_READERS.filter((f) => {
      const src = readFileSync(f, "utf8")
      return !/NOT EXISTS\s*\([\s\S]{0,400}?FROM picking_records[\s\S]{0,300}?pick_date\s*=/.test(src)
    })
    expect(
      offenders,
      "these turn attendance into money and count picking, without excluding days already paid by picking",
    ).toEqual([])
  })

  it("still lets the legacy attendance-only estate be paid", () => {
    /**
     * The fallback exists for estates that have not moved to the muster, and the fix must not buy
     * correctness by deleting it. Verified on dev alongside the double-count:
     *
     *   picks all day, no muster   Rs 694 -> Rs 200   the fix
     *   attendance only, no picking   Rs 494 -> Rs 494   untouched
     *   picks 0.5 + waters 0.5        Rs 347 -> Rs 347   untouched
     */
    const payroll = readFileSync("app/api/payroll-summary/route.ts", "utf8")
    expect(payroll).toMatch(/days_present/)
    expect(payroll).toMatch(/COALESCE\(w\.daily_rate, 0\)/)
  })
})

describe("the money arms of labour_cost are each counted once", () => {
  /**
   * labour_cost already UNIONs legacy transactions, muster assignments and picking. Any reader
   * that sums the view AND separately adds picking_records is counting picking twice -- the same
   * error in a different dress.
   */
  const SUMS_THE_VIEW = globSync("app/api/**/route.ts").filter((f) => {
    const src = readFileSync(f, "utf8")
    return /SUM\(total_cost\)[\s\S]{0,200}FROM labour_cost|FROM labour_cost[\s\S]{0,200}SUM\(total_cost\)/.test(src)
  })

  it("finds readers that sum the view", () => {
    expect(SUMS_THE_VIEW.length).toBeGreaterThan(0)
  })

  it("never adds a picking total to a labour_cost total in the same figure", () => {
    const offenders = SUMS_THE_VIEW.filter((f) => {
      const src = readFileSync(f, "utf8")
      // The dangerous composition is a single expression adding one to the other.
      return /(bulkCost|viewCost|labourCost)\s*\+\s*\w*[Pp]icking|[Pp]icking\w*\s*\+\s*(bulkCost|viewCost|labourCost)/.test(src)
    })
    expect(offenders, "these add picking to a total that already contains it").toEqual([])
  })
})
