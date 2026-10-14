import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import { aggregate, failedReads, rowsOrNone, type Reading } from "@/lib/server/incomplete-read"

/**
 * A DATABASE FAILURE MUST NOT BE REPORTED AS A MEASUREMENT.
 *
 * Six routes ran their reads as `runTenantQuery(...).catch(() => [])`. An empty result then became
 * `Number(undefined) || 0`, so a query that never executed produced the same figure as a season with
 * genuinely nothing in it. Nothing threw and nothing was logged, which is why it survived in six
 * places at once -- there was no error anywhere to notice.
 *
 * Two of them reached the customer as a confident false statement:
 *
 *   - season-pl fabricated `{ total_kg_received: 0 }`, which made unsoldKg negative, flipped
 *     balanceOk false, and rendered "Data integrity issue: sales kg exceed dispatch kgs received ...
 *     review both tabs to reconcile." A network blip accused the estate's own correct books of
 *     contradicting themselves and sent somebody auditing two tabs for a fault that did not exist.
 *   - ai-season-compare put "Labour cost: ₹0" into the prompt and Haiku wrote that costs had
 *     collapsed year on year -- then cached that for four hours.
 *
 * ⚠ WHY THE SHAPE IS DETECTABLE AT ALL: every one of these aggregates wraps its SUM in
 * `COALESCE(..., 0)`, so a successful aggregate always returns exactly one row, even for a tenant
 * with no data. "No row" therefore cannot mean "no data" -- only that the read did not happen. The
 * evidence was in the result set and the catch discarded it.
 */

/**
 * ⚠ DERIVED FROM THE FILESYSTEM, NOT LISTED. A hand-kept list of six routes is how the seventh
 * ships. git ls-files so a new route is covered the day it is added, with no edit here.
 */
const ROUTES = execFileSync("git", ["ls-files", "app/**/route.ts"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)

/**
 * ⚠ COMMENTS ARE STRIPPED FIRST, AND THAT IS LOAD-BEARING.
 *
 * The fix documents the old pattern verbatim in four files, so a scan of raw source matches its own
 * explanation and reports six offenders that are all prose. That failure points the wrong way --
 * it fails loudly and looks like the guard working, so you "fix" comments until it goes quiet.
 */
/**
 * ⚠ ONLY COMMENT-ONLY LINES ARE STRIPPED, NOT TRAILING ONES. Raised by CodeRabbit on #88, and the
 * narrower rule is the safer one: stripping from any `//` to end of line also blanks a `//` that is
 * inside a string or a template literal, which could hide real code on that line from the scan
 * below. A guard that erases what it is meant to read is worse than one that reports prose.
 *
 * Block comments still go wholesale -- the documentation this needs to ignore is all in `/** … *\/`
 * blocks and full-line `//` comments, which this covers. Verified by re-running the tamper suite.
 */
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")

/**
 * A catch handler that returns an array literal, or an object standing in for a result set.
 *
 * ⚠ KEYED ON WHAT THE HANDLER RETURNS, NOT ON WHAT IT IS ATTACHED TO. Walking backwards to prove
 * the receiver is a query means guessing how far back to look, and a fixed-size window is exactly
 * how a previous guard in this repo went vacuous -- a long comment pushed the match outside it.
 * The return value needs no window and is a cleaner discriminator anyway: `.catch(() => [])` is
 * never right for anything, while the legitimate uses of catch in this codebase return `{}` or
 * `null` from `request.json()`, which is a validated-downstream default rather than a measurement.
 */
const SWALLOWED_READ = /\.catch\(\s*(?:async\s*)?\(\s*\)\s*=>\s*(?:\[|\(\s*\{\s*rows\b)/g

const offenders = (file: string) => {
  const body = stripComments(readFileSync(file, "utf8"))
  return [...body.matchAll(SWALLOWED_READ)].map((m) => m[0])
}

describe("no route folds a failed read into an empty result", () => {
  it("scans a real set of routes, so it cannot pass by scanning nothing", () => {
    expect(ROUTES.length).toBeGreaterThan(50)
    expect(ROUTES).toContain("app/api/season-pl/route.ts")
    expect(ROUTES).toContain("app/api/ai-season-compare/route.ts")
  })

  it("finds no catch handler anywhere that substitutes an empty or fabricated result set", () => {
    const found = ROUTES.flatMap((file) => offenders(file).map((snippet) => `${file}  ${snippet}`))
    expect(
      found,
      "a read that fails must report that it failed -- returning [] here makes it indistinguishable " +
        "from a genuine zero, which is how season-pl accused estates of bad bookkeeping. " +
        "Use attemptRead from lib/server/incomplete-read.ts.",
    ).toEqual([])
  })

  /**
   * The scan above is a prohibition, which can be satisfied by deleting the catch and losing the
   * error entirely. These two check the replacement is actually wired in, by call and not by import
   * -- `toContain("attemptRead")` would pass on the import line alone.
   */
  it("has the routes that carried the bug calling attemptRead, not merely importing it", () => {
    for (const file of [
      "app/api/season-pl/route.ts",
      "app/api/ai-season-compare/route.ts",
      "app/api/recent-activity/route.ts",
    ]) {
      const body = stripComments(readFileSync(file, "utf8"))
      // `[<(]` because most of these calls carry an explicit row generic -- `attemptRead<{...}>(`.
      // An import mentions the name followed by `,` or `}`, so this still cannot pass on an import.
      expect(body, `${file} should route its reads through attemptRead`).toMatch(/attemptRead\s*[<(]/)
    }
  })

  /**
   * ⚠ ADDED BECAUSE THE TAMPER TEST FOUND THE CHECK ABOVE TOO WEAK. Unwrapping one of five reads in
   * recent-activity left the other four, so "mentions attemptRead somewhere" still passed and the
   * prohibition scan saw nothing either -- the mutation reached `[]` by a route that is not the
   * forbidden spelling. Counting is what closes that: EVERY read in these two files must be wrapped.
   *
   * Only these two, and deliberately so. season-pl's revenue, cost and processing reads are
   * unwrapped on purpose -- they have no honest degraded form, so they should throw and let the
   * route return an error. Wrapping those would be the bug pointing the other way.
   */
  it("wraps every single read in the two routes whose reads must all degrade", () => {
    for (const file of ["app/api/recent-activity/route.ts", "app/api/ai-season-compare/route.ts"]) {
      const body = stripComments(readFileSync(file, "utf8"))
      const reads = body.match(/runTenantQuery\s*\(/g) || []
      const wrapped = body.match(/attemptRead\s*(?:<[\s\S]*?>)?\s*\(\s*[^,]+,\s*runTenantQuery\s*\(/g) || []
      expect(reads.length, `${file} should still be doing its reads`).toBeGreaterThanOrEqual(5)
      expect(
        wrapped.length,
        `${file}: ${reads.length - wrapped.length} read(s) are not wrapped in attemptRead, so a ` +
          `failure there is invisible again`,
      ).toBe(reads.length)
    }
  })

  it("keeps the two figures that reach a customer nullable all the way out", () => {
    // season-pl: the reconciliation panel is the one that accused the estate. If these go back to
    // `number`, the null can only have been replaced by a zero somewhere upstream.
    const pl = readFileSync("app/api/season-pl/route.ts", "utf8")
    expect(pl).toMatch(/dispatchKgReceived:\s*number\s*\|\s*null/)
    expect(pl).toMatch(/balanceOk:\s*boolean\s*\|\s*null/)
    expect(pl).toMatch(/closingInventoryValue:\s*number\s*\|\s*null/)

    /**
     * ⚠ `null >= 0` IS `true` IN JAVASCRIPT. The original line was `balanceOk: unsoldKg >= 0`, and
     * left as-is over a nullable unsoldKg it reports an unreadable balance as "balances fine" --
     * the same lie, now wearing the fix as a disguise. This is the single most reversible line in
     * the change, so it is pinned explicitly.
     */
    expect(pl).toMatch(/balanceOk:\s*unsoldKg === null \? null : unsoldKg >= 0/)
  })

  it("only accuses the estate's records when both figures were actually read", () => {
    const tab = stripComments(readFileSync("components/season-pl-tab.tsx", "utf8"))
    // `!balanceOk` is true for null, which is how the accusation fired on a failed read.
    expect(tab).toMatch(/balanceOk === false &&/)
    expect(tab).not.toMatch(/\{!data\.reconciliation\.balanceOk && \(/)
  })

  it("never caches a partial season comparison", () => {
    /**
     * The cache holds four hours. Caching a comparison with a metric missing turns seconds of
     * database trouble into half a day of a quietly incomplete answer, long after the fault cleared.
     */
    const compare = stripComments(readFileSync("app/api/ai-season-compare/route.ts", "utf8"))
    expect(compare).toMatch(/if \(!comparePayload\.partial\)\s*\{\s*await writeResponseCache/)
  })

  it("does not report a failed read as 'no data yet'", () => {
    // Telling an estate with ten years of records that it has none is a different wrong answer,
    // not a lesser one. Volume may only count where it was read.
    const compare = stripComments(readFileSync("app/api/ai-season-compare/route.ts", "utf8"))
    expect(compare).toMatch(/volumeRead/)
    expect(compare).toMatch(/unavailable\.length === 0/)
  })

  it("will not publish a cost total that is missing a component", () => {
    /**
     * P2-6 from the 2026-10-14 audit. `tryQuery` there returns `ok: false` for an absent relation
     * and the consumer read `|| 0` from its empty rows regardless, while `hasData` was an **or** --
     * so a missing `labour_cost` view would have reported expenses-only as a valid cost per kg.
     * Labour is the dominant cost on these estates, so the headline costing number would have read
     * far too low and declared itself fine.
     */
    const route = stripComments(readFileSync("app/api/dashboard/cost-per-kg/route.ts", "utf8"))
    expect(route).toMatch(/hasData = laborResult\.ok && expenseResult\.ok/)
    expect(route).not.toMatch(/hasData = laborResult\.ok \|\| expenseResult\.ok/)
    // And the divide is gated on completeness, not just on a non-zero denominator.
    expect(route).toMatch(/missingComponents\.length === 0 && totalOutputKg > 0/)
  })

  it("stops reporting success:true from a route that failed", () => {
    const streak = stripComments(readFileSync("app/api/activity-streak/route.ts", "utf8"))
    // The old catch returned `{ success: true, streak: 0 }`, so the route looked healthy forever
    // and the release smoke -- which only checks for a status under 500 -- passed it too.
    expect(streak).not.toMatch(/success:\s*true,\s*streak:\s*0/)
    expect(streak).toMatch(/success:\s*false,\s*streak:\s*null/)
  })
})

/** Small, so the test can build one without a database. */
const ok = <T,>(rows: T[]): Reading<T> => ({ ok: true, rows })
const failed = <T,>(reason = "boom"): Reading<T> => ({ ok: false, reason })

describe("aggregate keeps a missing figure missing", () => {
  it("reads the value when the query succeeded", () => {
    expect(aggregate(ok([{ total: "1250.5" }]), "total")).toBe(1250.5)
  })

  it("returns 0 for a real measured zero", () => {
    // The COALESCE case: a tenant with no data still gets a row. This must NOT become null, or
    // every empty season would read as broken.
    expect(aggregate(ok([{ total: "0" }]), "total")).toBe(0)
  })

  it("returns null when the read failed", () => {
    expect(aggregate(failed(), "total")).toBeNull()
  })

  it("returns null when the query succeeded but produced no row at all", () => {
    // Should not happen with COALESCE, and if it does it is a changed query rather than a zero.
    expect(aggregate(ok([]), "total")).toBeNull()
  })

  it("returns null rather than NaN for an unparseable value", () => {
    // NaN propagates into arithmetic and renders as "NaN kg", which is at least visible -- but it
    // also makes `NaN > 0` false, so it would read as a zero in every threshold check.
    expect(aggregate(ok([{ total: "not a number" }]), "total")).toBeNull()
    expect(aggregate(ok([{ total: null }]), "total")).toBeNull()
  })
})

describe("the other two helpers", () => {
  it("rowsOrNone gives rows, or none, and never throws", () => {
    expect(rowsOrNone(ok([{ a: 1 }]))).toEqual([{ a: 1 }])
    expect(rowsOrNone(failed())).toEqual([])
  })

  it("failedReads names what is missing and nothing else", () => {
    expect(
      failedReads({ sales: ok([]), labour: failed(), pulping: failed() }),
    ).toEqual(["labour", "pulping"])
  })

  it("is empty when everything was read, which is what 'not partial' depends on", () => {
    expect(failedReads({ sales: ok([]), labour: ok([]) })).toEqual([])
  })
})
