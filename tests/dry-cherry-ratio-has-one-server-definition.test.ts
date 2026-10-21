import { describe, expect, it, vi } from "vitest"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

/**
 * THE DRY CHERRY RATIO HAD TWO SERVER-SIDE DEFINITIONS AND THEY WERE FREE TO DISAGREE.
 *
 * `recompute_processing_totals()` is a Postgres function, called by
 * `trg_processing_records_recompute` on every insert, update and delete of `processing_records`.
 * So the DATABASE owns the stored value. `lib/processing-utils.ts` carried a hundred lines of SQL
 * restating the same computation, and three routes called it.
 *
 * That is not a tidiness problem. It is the reason the app-side fix for the denominator could not
 * work: correcting the TypeScript would have shown the right ratio until the row was saved, at
 * which point the trigger would have written the old one back. Silently -- this codebase's whole
 * failure mode. See scripts/155 for the rule and the production evidence.
 *
 * So the invariant is: ONE server-side definition, and it lives in SQL where the trigger can reach
 * it. Everything else delegates.
 *
 * ⚠ THIS DELIBERATELY SAYS NOTHING ABOUT THE BROWSER. `components/processing-tab.tsx` computes a
 * ratio to show while somebody is still typing, before anything is saved -- that is a preview, not
 * a stored figure, and it is PR #66's business. Widening this guard to the client would make it
 * fail for a reason it is not about.
 */

const repoRoot = new URL("..", import.meta.url)
const repoFile = (relativePath: string) => readFileSync(new URL(relativePath, repoRoot), "utf8")

const tracked = (...globs: string[]) =>
  execFileSync("git", ["ls-files", ...globs], { encoding: "utf8", cwd: repoRoot })
    .split("\n")
    .filter(Boolean)

/**
 * Strips `--` SQL comments and `//` plus block comments, so this file's own explanation of the bug
 * cannot satisfy the scan. CLAUDE.md records four separate occasions where that happened.
 */
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<![:"'\\])\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "")

/**
 * Computing the ratio, as opposed to merely naming the column. `AS dry_cherry_percent` labels a
 * computed expression; `dry_cherry_percent =` assigns one. Reading the column, listing it among
 * writable fields, or selecting it are all fine and must stay fine -- several routes do.
 *
 * Three shapes, after review on #128:
 *   - the SQL alias
 *   - an assignment, with `(?!=)` so a COMPARISON like `row.dry_cherry_percent === 0` is not read
 *     as a definition. There is none today, and a false failure on correct code is how a guard
 *     gets weakened by whoever hits it next.
 *   - an object property whose value divides, which is how the rule would come back in TypeScript
 *     rather than SQL: `dry_cherry_percent: dryCherry / denom * 100`
 */
const COMPUTES_THE_RATIO =
  /\bAS\s+dry_cherry_percent\b|\bdry_cherry_percent\s*=(?!=)|\bdry_cherry_percent\s*:\s*[^,\n;{}]*\//

describe("the dry cherry ratio has exactly one server-side definition", () => {
  /**
   * ⚠ DERIVED BY PREFIX, NOT BY GLOB, AND THAT IS NOT A STYLE CHOICE. The first version of this
   * used `git ls-files "lib/**\/*.ts"`, which does not match `lib/processing-utils.ts` -- a `**`
   * glob needs a directory level, so every top-level file in lib/ was invisible. That is the one
   * file this guard exists to watch, so the scan passed over the defect while a `length > 100`
   * vacuity check sailed through on the nested files.
   *
   * Caught by tamper-testing, not by reading it back. CLAUDE.md documents this exact trap and I
   * still wrote it.
   */
  /**
   * ⚠ `components/` IS IN SCOPE, AND LEAVING IT OUT IS HOW THIS GUARD MISSED THE REAL OFFENDER.
   *
   * The first version scanned lib/ and app/ only -- "server files" -- on the reasoning that the
   * rule is a server rule. But the defect is a figure the ESTATE READS, and
   * components/processing-tab.tsx was recomputing it client-side with the old green+float
   * denominator, so on a wet route the database stored 0 and the form displayed something else.
   * The guard passed, the PR claimed the database owned the ratio, and the screen disagreed with
   * it. Found by CodeRabbit on #128, not by me.
   *
   * There is exactly one definition of this ratio and it lives in the database. Anywhere in the
   * app that computes it is a second one.
   */
  const serverFiles = tracked("*.ts", "*.tsx").filter(
    (path) =>
      (path.startsWith("lib/") || path.startsWith("app/") || path.startsWith("components/")) &&
      !path.startsWith("tests/"),
  )

  it("has server files to scan, including the top-level ones", () => {
    expect(serverFiles.length).toBeGreaterThan(100)
    // Named explicitly: this is the file that carried the duplicate, and a glob that drops it
    // makes every assertion below meaningless.
    expect(serverFiles).toContain("lib/processing-utils.ts")
    expect(serverFiles).toContain("app/api/processing-records/route.ts")
    // The file the first version of this guard could not see.
    expect(serverFiles).toContain("components/processing-tab.tsx")
  })

  it("is defined in a migration, not in application code", () => {
    const offenders = serverFiles.filter((path) => COMPUTES_THE_RATIO.test(stripComments(repoFile(path))))

    expect(
      offenders,
      "these files compute dry_cherry_percent themselves; the database owns it (scripts/155) and " +
        "a second definition will be silently overwritten by trg_processing_records_recompute",
    ).toEqual([])
  })

  it("the migration that owns it actually computes it", () => {
    /**
     * The other half of the vacuity check. If the rule ever moves out of SQL, the test above would
     * keep passing over a codebase where NOTHING computes the ratio -- which reads identical to
     * "correctly centralised".
     */
    const migrations = tracked("scripts/*.sql").filter((path) =>
      COMPUTES_THE_RATIO.test(stripComments(repoFile(path))),
    )
    expect(migrations.length).toBeGreaterThan(0)
    expect(migrations).toContain("scripts/155-dry-cherry-denominator-follows-the-route.sql")
  })

  it("the application delegates to the database function, executed rather than grepped", async () => {
    /**
     * ⚠ THIS USED TO MATCH THE SOURCE TEXT, which cannot tell a live call from a dead one. The
     * string `recompute_processing_totals(` sitting in an unreachable branch, a template literal
     * or a log line satisfies a regex exactly as well as the real thing -- and this file's whole
     * subject is a fix that looked applied and was not. Raised in review on #128.
     *
     * So the function is actually called, with runTenantQuery and sql.query mocked, and the
     * statement and parameters are asserted on what the code really passed.
     */
    const runTenantQuery = vi.fn(async (_sql: unknown, _ctx: unknown, result: unknown) => result)
    vi.doMock("@/lib/server/tenant-db", () => ({ runTenantQuery }))

    const { recomputeProcessingTotals } = await import("@/lib/processing-utils")

    const sentinel = Symbol("query result")
    const query = vi.fn(() => sentinel)
    const sql = { query } as never

    await recomputeProcessingTotals(
      sql,
      { tenantId: "11111111-1111-1111-1111-111111111111", role: "admin" },
      "22222222-2222-2222-2222-222222222222",
      "Arabica",
    )

    expect(query).toHaveBeenCalledTimes(1)
    const [statement, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(statement).toMatch(/recompute_processing_totals\s*\(/)
    expect(params).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "Arabica",
    ])

    // And the result of that query is what gets handed to runTenantQuery, rather than a second
    // statement built somewhere else.
    expect(runTenantQuery).toHaveBeenCalledTimes(1)
    expect(runTenantQuery.mock.calls[0][2]).toBe(sentinel)

    vi.doUnmock("@/lib/server/tenant-db")
    vi.resetModules()
  })

  it("the denominator follows the estate's route rather than assuming green plus float", () => {
    const migration = repoFile("scripts/155-dry-cherry-denominator-follows-the-route.sql")
    const sql = stripComments(migration)

    // The whole point of 155: the route decides the denominator.
    expect(sql).toMatch(/processingRoute/)
    expect(sql).toMatch(/v_route/)

    /**
     * And the old convention must not survive as the dry cherry denominator. Keyed on the two
     * columns appearing together inside the ratio's own CASE arm rather than anywhere in the file,
     * because `green_today` and `float_today` legitimately appear six other times computing
     * green_percent, float_percent and their running totals.
     *
     * ⚠ BOTH ANCHORS ARE VALIDATED BEFORE SLICING, and that is the whole reason this is not two
     * lines. `indexOf` returns -1 when it misses, and `slice(-1, n)` yields a one-character string
     * that matches nothing -- so renaming either anchor would make the negative assertion below
     * pass over an empty string while reading exactly like a clean run. Raised in review on #128,
     * and it is the same vacuity shape as the glob bug this file already carries a warning about.
     */
    const armStart = sql.indexOf("AS wp_dp_percent")
    const armEnd = sql.indexOf("AS dry_cherry_percent")
    expect(armStart, "the wp_dp_percent anchor moved; this slice no longer finds the ratio").toBeGreaterThan(-1)
    expect(armEnd, "the dry_cherry_percent anchor must follow wp_dp_percent").toBeGreaterThan(armStart)

    const ratioArm = sql.slice(armStart, armEnd)
    // Either operand order, across newlines: `float_today + green_today` is the same mistake.
    expect(ratioArm).not.toMatch(/green_today[\s\S]*?\+[\s\S]*?float_today/)
    expect(ratioArm).not.toMatch(/float_today[\s\S]*?\+[\s\S]*?green_today/)
  })
})
