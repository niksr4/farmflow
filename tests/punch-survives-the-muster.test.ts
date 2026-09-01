import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * A fingerprint punch outlives the manual sheet that forgot to tick it.
 *
 * FOUND ON HONEYFARM'S FIRST LIVE SCANNER DAY, 2026-09-01. Bopaiah punched four times from 16:28.
 * The muster was saved at 17:10 from a page opened before those punches existed, so he was not in
 * presentWorkerIds, and PUT /api/attendance deleted his biometric row -- check-in time and all.
 * He is only marked present today because the manager happened to re-save with him ticked two
 * minutes later, as an ordinary manual row with no check-in. Nobody decided any of that; a stale
 * tab did, and nothing on any screen said so.
 *
 * The route already carried a comment saying its careful diff existed to stop exactly this. It
 * guarded the INSERT arm with ON CONFLICT DO NOTHING and left the DELETE arm open -- the intent
 * written down and half-built, the same shape as the ON CONFLICT that was right in five places and
 * wrong in one, and as the missing-rate check that two screens got wrong the same way.
 *
 * check_in_time is the right predicate rather than source = 'biometric' because it is the evidence
 * itself: exactly one thing writes it (recordPunchesAndUpsertAttendance), and a manual row never
 * carries one. A label can be set by anything; a check-in time means a terminal watched somebody
 * arrive.
 */
const route = readFileSync("app/api/attendance/route.ts", "utf8")
const musterTab = readFileSync("components/attendance-tab.tsx", "utf8")
const ingest = readFileSync("lib/server/biometric-attendance.ts", "utf8")

describe("the muster save cannot delete a punch", () => {
  it("the delete skips any row with a check-in time", () => {
    const del = route.slice(route.indexOf("DELETE FROM attendance_records"))
    expect(del.slice(0, 400)).toContain("AND check_in_time IS NULL")
  })

  it("there is still exactly one delete against attendance_records", () => {
    // A second one added later would not inherit this guard, and would be just as silent.
    expect((route.match(/DELETE FROM attendance_records/g) ?? []).length).toBe(1)
    for (const file of ["app/api/attendance/assignments/route.ts", "app/api/attendance/summary/route.ts"]) {
      expect(readFileSync(file, "utf8"), `${file} should not delete attendance rows`).not.toContain(
        "DELETE FROM attendance_records",
      )
    }
  })

  it("check_in_time is written by the ingest and nothing else, which is what makes it evidence", () => {
    // If a manual path ever starts writing check_in_time, the predicate above stops meaning
    // "a terminal saw this person" and this guard quietly protects the wrong rows.
    expect(ingest).toContain("check_in_time")
    const writers = ["app/api/attendance/route.ts", "app/api/attendance/assignments/route.ts"]
    for (const file of writers) {
      const source = readFileSync(file, "utf8")
      expect(source, `${file} must not write check_in_time`).not.toMatch(/INSERT INTO attendance_records[\s\S]{0,400}check_in_time/)
      expect(source, `${file} must not update check_in_time`).not.toMatch(/UPDATE attendance_records[\s\S]{0,400}SET[\s\S]{0,200}check_in_time/)
    }
  })
})

describe("keeping someone is said out loud, not done behind the manager's back", () => {
  it("the route reports who it kept", () => {
    expect(route).toContain("keptWithPunches")
    // Counted into the total too -- otherwise the toast says 27 and the reloaded roll shows 28.
    expect(route).toContain("presentCount: presentWorkerIds.length + keptWithPunches.length")
  })

  it("the muster shows it rather than swallowing it", () => {
    expect(musterTab).toContain("keptWithPunches")
    expect(musterTab).toContain("punched in on the scanner")
  })

  it("the save-bar count comes from the server, not the local tick count", () => {
    // The client cannot know about a punch that landed after its page loaded. Trusting the local
    // count is how the toast and the roll end up disagreeing by one.
    expect(musterTab).toContain("data.presentCount")
  })
})
