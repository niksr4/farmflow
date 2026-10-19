import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { countWorkersMissingRate, hasPayBasis, isWorkersDone } from "../components/inventory-system/onboarding"

/**
 * A MONTHLY STAFF MEMBER IS NOT "MISSING A DAILY RATE". THE SCHEMA FORBIDS THEM HAVING ONE.
 *
 * scripts/141-monthly-wage.sql adds
 *
 *   CHECK (monthly_wage IS NULL OR COALESCE(daily_rate, 0) = 0)
 *
 * so recording a salary makes a daily rate impossible. The onboarding step "Workers and their
 * daily rates" asked for `every(Number(w.dailyRate) > 0)` -- an unsatisfiable condition for an
 * estate with any salaried staff. The step stayed red forever and the banner told them to fix
 * something the database will not accept. Live for Laxmi: 2 of 27 workers.
 *
 * ⚠ THIS WAS THE THIRD SITE OF ONE BUG. payroll-summary/route.ts:461 fixed it, with a comment
 * saying "same fix as the muster's own banner in attendance-tab.tsx" -- the second site. Both go
 * through isPaidDaily so they cannot drift from each other. This one was invisible to both
 * because it lives in the onboarding module, which is why the scan at the bottom is derived.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

const daily = (dailyRate: number | null) => ({ workerType: "permanent", dailyRate, monthlyWage: null })
const salaried = (monthlyWage: number | null) => ({ workerType: "staff", dailyRate: null, monthlyWage })

describe("hasPayBasis", () => {
  it("accepts a daily worker with a rate and refuses one without", () => {
    expect(hasPayBasis(daily(450))).toBe(true)
    expect(hasPayBasis(daily(null))).toBe(false)
    expect(hasPayBasis(daily(0))).toBe(false)
  })

  it("accepts a salaried worker on their SALARY, with no daily rate at all", () => {
    // The whole point. This returned false before, forever, for a correctly-recorded worker.
    expect(hasPayBasis(salaried(17000))).toBe(true)
  })

  it("still refuses a salaried worker with no salary, because they are genuinely unpriced", () => {
    // The fix is the full rule, not an exemption for staff.
    expect(hasPayBasis(salaried(null))).toBe(false)
    expect(hasPayBasis(salaried(0))).toBe(false)
  })

  it("treats an unknown worker type as paid daily, matching isPaidDaily's default", () => {
    expect(hasPayBasis({ workerType: undefined, dailyRate: 450, monthlyWage: null })).toBe(true)
    expect(hasPayBasis({ workerType: undefined, dailyRate: null, monthlyWage: null })).toBe(false)
  })
})

describe("the onboarding step can go green for a real estate", () => {
  it("goes green for Laxmi's actual shape: daily workers plus two salaried staff", () => {
    const roster = [daily(450), daily(500), salaried(17000), salaried(16000)]
    expect(
      isWorkersDone({ workers: roster }),
      "this is the exact composition of a real tenant and the step must be reachable",
    ).toBe(true)
    expect(countWorkersMissingRate({ workers: roster })).toBe(0)
  })

  it("stays red when a daily worker really has no rate", () => {
    // Completion is still ALL, not ANY -- that was a deliberate earlier fix and must survive.
    expect(isWorkersDone({ workers: [daily(450), daily(null)] })).toBe(false)
    expect(countWorkersMissingRate({ workers: [daily(450), daily(null), salaried(17000)] })).toBe(1)
  })

  it("stays red for an empty roster", () => {
    expect(isWorkersDone({ workers: [] })).toBe(false)
  })

  it("counts the same set the completion check uses", () => {
    // A banner saying "0 workers have no rate" beside a red step is its own bug.
    const roster = [daily(450), salaried(17000), daily(null)]
    expect(isWorkersDone({ workers: roster })).toBe(countWorkersMissingRate({ workers: roster }) === 0)
  })
})

describe("no fourth site of this bug", () => {
  /**
   * DERIVED. Any file judging whether a worker is priced must route through isPaidDaily, because
   * the three that already do cannot see a fourth that does not. Keyed on the shape of the
   * mistake -- a daily-rate test with no worker-type in sight -- not on a list of files.
   */
  const sources = execFileSync("git", ["ls-files", "lib", "app", "components"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(ts|tsx)$/.test(f))

  const offenders = sources.filter((file) => {
    const src = stripComments(readFileSync(file, "utf8"))
    /**
     * ⚠ MATCH A VERDICT, NOT UI COPY.
     *
     * The first version of this also matched /(?:no|missing)[ _]?rate/i anywhere in the file, and
     * flagged components/attendance/worker-allocation.tsx -- whose only hit is the placeholder
     * `"no rate yet"` inside a rate input. A placeholder is a hint, not a judgement: it blocks
     * nothing and accuses nobody. Flagging it would have had me "fix" correct code, and a guard
     * that cries wolf is a guard someone deletes.
     *
     * So key on the shape of the decision -- a named missing-rate verdict, or an every/filter
     * over a dailyRate nullity test -- rather than on prose that happens to contain the words.
     */
    const judges =
      /missingDailyRate|WorkersMissingRate|missing_daily_rate|missingRate/.test(src) ||
      /\.(?:every|filter|some)\([^)]*daily_?[Rr]ate/.test(src)
    if (!judges) return false
    // Fine if it knows about worker types or salaries at all.
    return !/isPaidDaily|monthlyWage|monthly_wage|isPaidMonthly/.test(src)
  })

  it("finds the files that judge this at all, so the scan is not vacuous", () => {
    const judging = sources.filter((f) => {
      const src = stripComments(readFileSync(f, "utf8"))
      return /isPaidDaily\s*\(/.test(src)
    })
    expect(
      judging.length,
      "nothing routes through isPaidDaily -- the scan is broken, not the code",
    ).toBeGreaterThanOrEqual(3)
  })

  it("has no file deciding a worker is unpriced without knowing their pay basis", () => {
    expect(
      offenders,
      "these files decide a worker is missing a rate from dailyRate alone. A salaried worker has " +
        "no daily rate by database constraint, so they are judged unpriced forever with no way " +
        "for the estate to fix it. Route through isPaidDaily (lib/worker-types.ts).",
    ).toEqual([])
  })
})
