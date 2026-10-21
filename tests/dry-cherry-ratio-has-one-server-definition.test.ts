import { describe, expect, it } from "vitest"
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
 */
const COMPUTES_THE_RATIO = /\bAS\s+dry_cherry_percent\b|\bdry_cherry_percent\s*=/

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
  const serverFiles = tracked("*.ts", "*.tsx").filter(
    (path) => (path.startsWith("lib/") || path.startsWith("app/")) && !path.startsWith("tests/"),
  )

  it("has server files to scan, including the top-level ones", () => {
    expect(serverFiles.length).toBeGreaterThan(100)
    // Named explicitly: this is the file that carried the duplicate, and a glob that drops it
    // makes every assertion below meaningless.
    expect(serverFiles).toContain("lib/processing-utils.ts")
    expect(serverFiles).toContain("app/api/processing-records/route.ts")
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

  it("the application delegates to the database function", () => {
    const source = stripComments(repoFile("lib/processing-utils.ts"))
    // A call, not a mention: a bare name match is satisfied by a comment or a string in a log line.
    expect(source).toMatch(/recompute_processing_totals\s*\(/)
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
     */
    const ratioArm = sql.slice(sql.indexOf("AS wp_dp_percent"), sql.indexOf("AS dry_cherry_percent"))
    expect(ratioArm).not.toMatch(/green_today[^\n]*\+[^\n]*float_today/)
  })
})
