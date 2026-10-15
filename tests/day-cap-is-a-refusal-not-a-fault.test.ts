import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import { dayCapRefusal, DAY_CAP_STATUS } from "@/lib/server/day-cap-refusal"

/**
 * EVERY ROUTE THAT WRITES A DAY-CAPPED TABLE MUST SAY WHY IT REFUSED.
 *
 * `scripts/152` puts `assert_worker_day_budget()` on both `labour_assignments` and
 * `picking_records`, and it RAISEs when a worker-day would exceed 1.0 across day-work and picking
 * together. A route that does not map that raise reports it as its generic 500.
 *
 * REPORTED FROM PRODUCTION 2026-10-15: Nandu at Laxmi logged a whole-day picking record for Aliza
 * on the 14th. She already had a whole day of day-work (activity 140, day_fraction 1.000), so the
 * trigger refused it and he was told **"Failed to save picking record"**. He had filled the form in
 * correctly and the message gave him nothing to act on.
 *
 * ⚠ AND IT WAS HALF-FIXED BY ITS OWN AUTHOR. PR #85 added this mapping to the picking EDIT route
 * only. The sweep that should have followed did not happen, so the CREATE route and the MUSTER
 * route both still fell through -- and the muster is what every tenant writes every morning. This
 * test is the sweep, made permanent: it derives the route set from the SQL they contain, so a
 * fourth writer of these tables is covered on the day it is written.
 */

const ROUTES = execFileSync("git", ["ls-files", "app"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith("route.ts"))

/** Routes that write either day-capped table, found by their SQL rather than listed by hand. */
const WRITERS = ROUTES.filter((f) => {
  const body = readFileSync(f, "utf8")
  return /(INSERT INTO|UPDATE)\s+(picking_records|labour_assignments)\b/.test(body)
})

describe("a day-budget refusal reaches the writer as a sentence", () => {
  it("found the routes that write a day-capped table, so this cannot pass vacuously", () => {
    expect(WRITERS.length).toBeGreaterThanOrEqual(3)
    expect(WRITERS).toContain("app/api/picking-records/route.ts")
    expect(WRITERS).toContain("app/api/picking-records/[id]/route.ts")
    expect(WRITERS).toContain("app/api/attendance/assignments/route.ts")
  })

  it("has every one of them map the refusal instead of returning a bare 500", () => {
    const unmapped = WRITERS.filter((f) => {
      const body = readFileSync(f, "utf8")
      // Keyed on the CALL, not a mention -- an import alone must not satisfy this.
      return !/dayCapRefusal\s*\(/.test(body)
    })
    expect(
      unmapped,
      "these routes write a table carrying the worker-day trigger but do not map its refusal, so " +
        "an overbooking reaches the writer as a generic 500 with nothing to act on. Use " +
        "dayCapRefusal() from lib/server/day-cap-refusal.ts.",
    ).toEqual([])
  })

  it("returns 409 for it, not 400 and not 500", () => {
    // 400 would blame the input, which was valid. 500 blames the server, which is working. The
    // request was understood and the current state refuses it, which is what 409 means.
    expect(DAY_CAP_STATUS).toBe(409)
    for (const f of WRITERS) {
      const body = readFileSync(f, "utf8")
      expect(body, `${f} should answer the refusal with the shared status`).toMatch(
        /DAY_CAP_STATUS|status:\s*409/,
      )
    }
  })
})

describe("dayCapRefusal tells a refusal from a real fault", () => {
  const raise = (m: string) => new Error(m)

  /**
   * ⚠ THESE ARE THE REAL MESSAGES, read off assert_worker_day_budget() on production. An earlier
   * version of this test invented plausible-sounding phrasings instead, and two of them did not
   * match -- which would have left the matcher tuned to sentences the database never produces
   * while believing it was covered.
   */
  const OVER_A_DAY =
    "A worker's day is one day. This person already has 1.00 of 1.00 booked on 2026-10-14 " +
    "(1.00 from day-work on the muster), and this adds 1.00 more. Picking and day-work share the " +
    "same day: remove or halve the other entry first."
  const TOO_MANY_JOBS =
    "This person already has 2 jobs on 2026-10-14 (limit 2), counting picking and day-work " +
    "together. Correct one of them instead of adding another."

  it("recognises both wordings the trigger actually raises", () => {
    expect(dayCapRefusal(raise(OVER_A_DAY))).not.toBeNull()
    expect(dayCapRefusal(raise(TOO_MANY_JOBS))).not.toBeNull()
    // The 116-era phrasing, kept so an older deployment is still mapped.
    expect(dayCapRefusal(raise("worker day budget exceeded"))).not.toBeNull()
  })

  it("passes the message through rather than inventing one", () => {
    // This is the exact sentence Nandu should have seen on 2026-10-14 and did not. It names the
    // day, what is already booked, and what to do -- all of which a rewrite here would lose.
    expect(dayCapRefusal(raise(OVER_A_DAY))).toBe(OVER_A_DAY)
  })

  it("does NOT swallow an unrelated failure", () => {
    expect(dayCapRefusal(raise("connection terminated unexpectedly"))).toBeNull()
    expect(dayCapRefusal(raise('null value in column "kg_picked" violates not-null constraint'))).toBeNull()
    expect(dayCapRefusal(raise(""))).toBeNull()
    expect(dayCapRefusal(undefined)).toBeNull()
  })
})
