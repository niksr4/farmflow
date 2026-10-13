import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { describeUndeployableWorkers, isDeployable } from "../lib/attendance-roster"

/**
 * THE MUSTER MUST NOT REFUSE A BATCH WITHOUT SAYING WHO.
 *
 * HoneyFarm, 2026-10-13, mid-harvest. The writer deployed arabica picking, then every later batch
 * failed with "One or more workers are invalid for this tenant". The cause was one worker, Saina,
 * taken off the roster but still holding a biometric punch at 08:11 that morning:
 *
 *   - the roster read filters active = TRUE; the attendance read does not, so she appeared on the
 *     day's sheet (29 people, 30 entries) and could be selected
 *   - the save filtered on active = TRUE and required an exact count match, so the whole batch died
 *   - the message named nobody, so there was no way to find her among twenty-odd people
 *
 * Verified against production: submitting Radha + Sabiya + Saina returned 2 of 3 and was rejected;
 * the same two without her were accepted.
 */

describe("a worker who was there that day can still be given work", () => {
  /**
   * ⚠ THE RULE, AND IT IS A DECISION. Removing somebody from the roster means "do not roster them
   * in future", NOT "void the day they already worked". The other reading silently strands a
   * leaver's final day of pay -- money owed for work done, lost because of an admin action taken
   * afterwards. That is this codebase's signature failure: a confident wrong number, no error.
   */
  it("allows an off-roster worker on a day they were present", () => {
    expect(isDeployable({ active: false, presentOnDate: true })).toBe(true)
  })

  it("still refuses an off-roster worker on a day they were not present", () => {
    expect(isDeployable({ active: false, presentOnDate: false })).toBe(false)
  })

  it("allows anyone on the roster", () => {
    expect(isDeployable({ active: true, presentOnDate: false })).toBe(true)
    expect(isDeployable({ active: true, presentOnDate: true })).toBe(true)
  })
})

describe("the refusal names the worker", () => {
  const w = (id: string, fullName: string, active: boolean, presentOnDate: boolean) => ({
    id,
    fullName,
    active,
    presentOnDate,
  })

  it("accepts HoneyFarm's real batch now that Saina was present that morning", () => {
    // The exact case that broke: two on the roster plus one removed worker who punched at 08:11.
    const problem = describeUndeployableWorkers(
      ["r", "sb", "sn"],
      [w("r", "Radha", true, true), w("sb", "Sabiya", true, true), w("sn", "Saina", false, true)],
    )
    expect(problem).toBeNull()
  })

  it("NAMES the worker when one genuinely cannot be deployed", () => {
    const problem = describeUndeployableWorkers(
      ["r", "sn"],
      [w("r", "Radha", true, true), w("sn", "Saina", false, false)],
    )
    expect(problem).toContain("Saina")
    // The old message. If it ever comes back, this test is the thing that notices.
    expect(problem).not.toContain("One or more workers are invalid")
  })

  it("names every one of them, not just the first", () => {
    const problem = describeUndeployableWorkers(
      ["a", "b", "c"],
      [w("a", "Akibul", false, false), w("b", "Kajolly", false, false), w("c", "Radha", true, true)],
    )
    expect(problem).toContain("Akibul")
    expect(problem).toContain("Kajolly")
    expect(problem).not.toContain("Radha")
  })

  it("tells the writer what to actually do about it", () => {
    const problem = describeUndeployableWorkers(["sn"], [w("sn", "Saina", false, false)])
    // A message that names the problem but not the remedy still costs an afternoon.
    expect(problem).toMatch(/Remove|put .* back|Workers/i)
  })

  it("handles an id that belongs to no worker without inventing a name", () => {
    const problem = describeUndeployableWorkers(["ghost"], [])
    expect(problem).toMatch(/does not belong to this estate/i)
    expect(problem).toMatch(/Refresh/i)
  })

  it("says nothing when every worker is fine", () => {
    expect(describeUndeployableWorkers(["r"], [w("r", "Radha", true, false)])).toBeNull()
    expect(describeUndeployableWorkers([], [])).toBeNull()
  })
})

describe("both write paths use the rule, not their own copy of it", () => {
  /**
   * The deployment route and the presence route carried the SAME `active = TRUE` filter and the
   * SAME anonymous message. Fixing one and leaving the other is how half an incident comes back a
   * month later, so this asserts neither reintroduces the filter or the old wording.
   */
  const ROUTES = ["app/api/attendance/assignments/route.ts", "app/api/attendance/route.ts"]

  it("neither route filters the DEPLOYABILITY lookup on active any more", () => {
    /**
     * ⚠ SCOPED TO THE RIGHT QUERY. The first version matched every `FROM attendance_workers w`
     * block and failed on app/api/attendance/route.ts -- correctly, but for the wrong reason: that
     * file has other queries which SHOULD filter on active (the roster list the muster renders, and
     * the weekly summary). A scan that cannot tell them apart would either fail forever or be
     * loosened until it saw nothing.
     *
     * The deployability lookup is the one computing `present_on_date`; nothing else needs it.
     */
    for (const path of ROUTES) {
      const src = readFileSync(path, "utf8")
      const lookups = (src.match(/SELECT[\s\S]{0,600}?present_on_date[\s\S]{0,300}?`/g) || [])
      expect(
        lookups.length,
        `${path} has no lookup computing present_on_date, so the rule cannot be applied`,
      ).toBeGreaterThan(0)
      for (const lookup of lookups) {
        expect(lookup, `${path} re-added an active filter to the deployability lookup`).not.toMatch(
          /w\.active\s*=\s*TRUE/i,
        )
      }
    }
  })

  it("neither route still returns the anonymous message", () => {
    for (const path of ROUTES) {
      const src = readFileSync(path, "utf8")
      expect(src, `${path} still returns the message that names nobody`).not.toContain(
        "One or more workers are invalid for this tenant",
      )
    }
  })

  it("both call the shared rule", () => {
    for (const path of ROUTES) {
      const src = readFileSync(path, "utf8")
      // Keyed on the CALL, not the import line.
      expect(src, `${path} does not call describeUndeployableWorkers`).toMatch(
        /describeUndeployableWorkers\s*\(/,
      )
    }
  })
})
