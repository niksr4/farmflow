import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * DDL BELONGS TO `adminSql`. `sql` CANNOT RUN IT.
 *
 * lib/server/db.ts exposes two clients and the difference is a privilege boundary, not a style
 * preference. `sql` is the app_runtime connection: least-privilege, non-BYPASSRLS, DML-only, and
 * NOT the owner of any table. `adminSql` is neondb_owner and exists for DDL and self-healing.
 *
 * WHERE THIS CAME FROM. app/api/migrate-sales/route.ts issued twelve ALTER TABLEs through `sql`.
 * ALTER TABLE checks ownership before anything else, so every one would have been refused wherever
 * APP_DATABASE_URL is set -- both dev and prod. Verified against production: sales_records and
 * dispatch_records are owned by neondb_owner and the runtime role is app_runtime. `IF NOT EXISTS`
 * does not rescue it; that suppresses the "already exists" error, not the privilege check.
 *
 * That route has since been DELETED rather than repaired, so this guard now protects against the
 * class rather than a live instance -- which is the point of it. Nothing in the tree offends
 * today, and the scanner's own behaviour is asserted below so it cannot quietly stop working while
 * the tree stays clean.
 *
 * The failure mode is why a guard is worth more than the one fix: an owner-gated, rarely-called
 * route can sit broken indefinitely without anyone noticing -- the project's usual shape, where
 * nothing throws in front of a person.
 */

const DDL = /\b(ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|CREATE\s+INDEX|DROP\s+INDEX|CREATE\s+(?:OR\s+REPLACE\s+)?(?:VIEW|FUNCTION)|ALTER\s+TYPE|CREATE\s+TYPE|GRANT|REVOKE)\b/i

/**
 * Comments are blanked (newlines preserved, so reported line numbers stay true) BEFORE scanning.
 *
 * Not defensive tidiness -- this guard failed on a clean tree without it. The fix it guards carries
 * a comment reading "adminSql, NOT `sql`. This is DDL...", and the backtick closing that inline
 * `sql` looks exactly like the start of a tagged template. The scanner then read on to the next
 * backtick, swallowed the words "ALTER TABLE" out of the explanation, and reported the file that
 * had just been fixed.
 *
 * Same trap as the JSX-comment case in tests/today-is-the-estates-today.test.ts, met twice in one
 * day: describing a bug must never count as committing it.
 */
const blankComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => " ".repeat(m.length))

/**
 * Walks each tagged template to its closing backtick and asks what is inside, rather than matching
 * a line. A multi-line DDL statement -- which is how every non-trivial one is written -- has its
 * verb on the first line and its body on the next five.
 *
 * TAKES SOURCE TEXT so the tests below can exercise THIS function instead of re-implementing its
 * regex. An earlier version kept a private copy of the pattern in the test, which proved the
 * pattern could tell adminSql from sql and said nothing about whether the scanner used it --
 * exactly the failure CLAUDE.md records from PR #48, where hard-coding a count left the guard
 * green. Raised again by CodeRabbit on PR #53.
 *
 * Whitespace is allowed before the backtick: ``sql `SELECT 1` `` is a legal tagged template, so a
 * pattern demanding the backtick immediately after the identifier can be stepped around with one
 * space.
 */
const findRuntimeDdlLines = (source: string): number[] => {
  const src = blankComments(source)
  // The negative lookbehind is load-bearing: without it `adminSql` also matches on `sql`
  // and the guard reports the correct client as the offender.
  const tag = /(?<![A-Za-z_$])(adminSql|sql)\s*`/g
  const lines: number[] = []
  let match: RegExpExecArray | null
  while ((match = tag.exec(src)) !== null) {
    let i = match.index + match[0].length
    while (i < src.length && !(src[i] === "`" && src[i - 1] !== "\\")) i += 1
    const body = src.slice(match.index + match[0].length, i)
    if (match[1] === "sql" && DDL.test(body)) lines.push(src.slice(0, match.index).split("\n").length)
  }
  return lines
}

const ddlThroughRuntimeClient = (): Record<string, number[]> => {
  // .tsx as well as .ts: a server component is a .tsx file and can hold a query just as easily.
  const files = execSync("git ls-files app lib", { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  const offenders: Record<string, number[]> = {}
  for (const file of files) {
    const lines = findRuntimeDdlLines(readFileSync(resolve(process.cwd(), file), "utf8"))
    if (lines.length) offenders[file] = lines
  }
  return offenders
}

describe("schema changes use the connection that is allowed to make them", () => {
  it("issues no DDL through the DML-only runtime client", () => {
    const offenders = ddlThroughRuntimeClient()
    expect(
      Object.entries(offenders).map(([f, lines]) => `${f}: ${lines.length} at ${lines.join(", ")}`),
      "use adminSql for DDL — `sql` is app_runtime, which owns no tables and will be refused",
    ).toEqual([])
  })

  it("distinguishes the two clients rather than matching any identifier ending in sql", () => {
    // The whole guard rests on telling `adminSql` from `sql`. If the lookbehind were dropped it
    // would flag every correct adminSql call, which is noise -- and noise is how a real hit gets
    // waved through.
    //
    // Exercises findRuntimeDdlLines itself. This test used to build a private copy of the regex,
    // which proved the PATTERN could tell them apart and said nothing about whether the scanner
    // used it -- so replacing the scanner's body with `return []` would have left it green.
    expect(findRuntimeDdlLines("await adminSql`ALTER TABLE x ADD COLUMN y int`")).toEqual([])
    expect(findRuntimeDdlLines("await sql`ALTER TABLE x ADD COLUMN y int`")).toEqual([1])
  })

  it("is not stepped around by a space before the backtick", () => {
    // ``sql `SELECT 1` `` is a legal tagged template. A pattern demanding the backtick immediately
    // after the identifier is defeated by one keystroke. Raised by CodeRabbit on PR #53.
    expect(findRuntimeDdlLines("await sql `ALTER TABLE x ADD COLUMN y int`")).toEqual([1])
    expect(findRuntimeDdlLines("await adminSql `ALTER TABLE x ADD COLUMN y int`")).toEqual([])
  })

  it("reports the line the statement is on", () => {
    const src = ["const a = 1", "const b = 2", "await sql`DROP TABLE t`"].join("\n")
    expect(findRuntimeDdlLines(src)).toEqual([3])
  })

  it("scans .tsx as well as .ts", () => {
    /**
     * A server component is a .tsx file and can hold a query as easily as a route can. The
     * discovery filter took only .ts, so DDL in a server component was invisible -- an exemption
     * by file extension, which is the same shape as the hand-kept file list CLAUDE.md warns about.
     * Raised by CodeRabbit on PR #53.
     */
    const discovered = execSync("git ls-files app lib", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    expect(discovered.some((f) => f.endsWith(".tsx")), "no .tsx reached the scanner").toBe(true)
    // And the scanner itself does not care what the extension was:
    expect(findRuntimeDdlLines("export default function P() { void sql`DROP TABLE t` }")).toEqual([1])
  })

  it("leaves ordinary reads and writes alone", () => {
    expect(findRuntimeDdlLines("await sql`SELECT id FROM picking_records`")).toEqual([])
    expect(findRuntimeDdlLines("await sql`UPDATE users SET a = 1`")).toEqual([])
  })

  it("sees DDL whose statement runs past the first line", () => {
    // Every real migration statement is written this way.
    const multiline = "CREATE TABLE IF NOT EXISTS picking_rates (\n  tenant_id uuid,\n  name text\n)"
    expect(DDL.test(multiline)).toBe(true)
    // ...and a plain read is not DDL, so the guard does not flag ordinary queries.
    expect(DDL.test("SELECT id FROM picking_records WHERE tenant_id = $1")).toBe(false)
    expect(DDL.test("UPDATE users SET password_hash = $1 WHERE id = $2")).toBe(false)
  })
})

describe("the scanner reads code, not prose about code", () => {
  it("does not flag a comment that quotes the bug it warns against", () => {
    // Verbatim shape of the comment that broke this guard on a clean tree.
    const src = [
      "/**",
      " * adminSql, NOT `sql`. This is DDL, and ALTER TABLE checks ownership first.",
      " */",
      "await adminSql`ALTER TABLE x ADD COLUMN y int`",
    ].join("\n")
    expect(blankComments(src)).not.toContain("ALTER TABLE checks ownership")
    // ...while the real statement below it survives untouched.
    expect(blankComments(src)).toContain("adminSql`ALTER TABLE x ADD COLUMN y int`")
    // And end to end: the scanner reports nothing for this file.
    expect(findRuntimeDdlLines(src)).toEqual([])
  })

  it("keeps line numbers honest after blanking", () => {
    // Blanking must preserve newlines, or every reported line number shifts and the guard sends
    // whoever reads it to the wrong place.
    const src = "// one\n/* two\n   three */\nawait sql`SELECT 1`"
    expect(blankComments(src).split("\n")).toHaveLength(src.split("\n").length)
  })
})
