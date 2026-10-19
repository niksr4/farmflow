import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Revenue has to come from one place.
 *
 * It did not, and the cost was real: `other_sales_records` holds pepper and contract sales, and
 * six routes summed only `sales_records`. HoneyFarm's Rs 12,12,380 of pepper was therefore
 * missing from the P&L tab, cost-per-kg, estate pulse, the intelligence brief, the season
 * summary and the year-on-year comparison, while the balance sheet showed it — two tabs, two
 * revenues, same estate.
 *
 * `lib/server/pnl.ts` was the first attempt at a fix and its own comment records that the export
 * had already dropped other_sales_records once. A shared helper does not help when a new route
 * can write its own SQL, so revenue moved into the `booked_revenue` view (scripts/121) and this
 * test is what keeps it there.
 */

/**
 * ⚠ THIS SCANNED `app/api` ONLY, AND THE WORST OFFENDER WAS NEVER IN `app/api`.
 *
 * The weekly digest, the daily digest and the per-estate breakdown inside both live in
 * `lib/server/agents/`, and all three ran `SUM(revenue) FROM sales_records` -- the exact query this
 * test's own docblock says was abolished. So the figure that goes out to the customer BY EMAIL every
 * Monday was pepper-blind while this test passed, and the email disagreed with the P&L tab of the
 * same estate by HoneyFarm's Rs 12,12,380.
 *
 * A guard whose name is broader than its scope is worse than no guard, because the name is what the
 * next person reads. `labour_cost` has twenty readers and `estate_cost` has four, and the only
 * difference between them is that labour's guard was pointed at every directory that could hold a
 * caller. This one now is too.
 */
const SCAN_ROOTS = [path.resolve(__dirname, "../app/api"), path.resolve(__dirname, "../lib")]

/** Files allowed to read the underlying tables: they are the CRUD surface for them. */
const ALLOWED_RAW_READERS = new Set([
  "app/api/sales/route.ts",
  "app/api/other-sales/route.ts",
  // Reads created_at only, as one arm of a "when did anything last happen" union.
  "app/api/dashboard/estate-pulse/route.ts",
])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith(".ts")) out.push(full)
  }
  return out
}

const REPO_ROOT = path.resolve(__dirname, "..")

/**
 * Comments are stripped before scanning, and THAT INCLUDES SQL COMMENTS.
 *
 * ⚠ Caught by tamper-testing this guard, not by review. Stripping only JS comments left the
 * `mustUseView` assertion passing over a file whose SQL read `sales_records`, because the fix's own
 * explanatory line -- `-- booked_revenue, not sales_records: ...` -- sits INSIDE the template
 * literal and satisfied a bare `/booked_revenue/` match on its own. A guard that its own
 * documentation can satisfy is the exact failure mode CLAUDE.md records, arriving by a door the
 * JS-comment strip does not cover.
 *
 * The SQL pattern requires whitespace on both sides of `--` so a decrement (`attempts--`, `--i`)
 * is not mistaken for a comment and does not silently delete the rest of a line of real code.
 */
const stripComments = (body: string) =>
  body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[^\n"'`]*\/\/.*$/gm, " ")
    /**
     * ⚠ TWO BUGS IN ONE LINE, BOTH OF WHICH LET A GUARD GO QUIET. It read
     * `/(^|\s)--\s.*$/gm`, requiring whitespace AFTER the dashes.
     *
     *  1. Postgres accepts `--FROM booked_revenue` as a comment and that pattern left it intact,
     *     so a COMMENTED-OUT view read satisfied the "this file must read the view" assertion.
     *     The guard passed on a file that no longer reads booked_revenue at all.
     *  2. `\s` matches a newline, so on an empty `--` comment the `\s` after the dashes consumed
     *     the line break and `.*$` then ate the WHOLE NEXT LINE -- which could be a forbidden
     *     `SUM(revenue) FROM sales_records`, deleted before the scan ever saw it.
     *
     * `[^\n]*` cannot cross a line break, which fixes both. The leading `(^|\s)` is kept so a
     * decrement (`attempts--`, `--i`) is still not mistaken for a comment; a preceding newline
     * matched by `\s` is put back by `$1`. Raised by CodeRabbit on PR #123, and both cases are
     * tamper-tested below.
     */
    .replace(/(^|\s)--[^\n]*/gm, "$1 ")

const routes = SCAN_ROOTS.flatMap(walk).map((file) => ({
  rel: path.relative(REPO_ROOT, file),
  body: stripComments(readFileSync(file, "utf8")),
}))

/** Does this file total up money from a table rather than from the view? */
const sumsRawRevenue = (body: string) =>
  /SUM\(\s*(?:[a-z_]+\.)?(?:revenue|total_revenue|contract_amount)\s*\)/i.test(body) &&
  /\bFROM\s+(sales_records|other_sales_records)\b/i.test(body)

/**
 * The stripper is the guard's foundation: everything below scans its output, so a bug here makes
 * every assertion in this file quietly weaker. CodeRabbit asked for these two cases by name on
 * PR #123 and both of them passed against the old pattern.
 */
describe("the SQL comment stripper cannot hide what this guard looks for", () => {
  it("treats --FROM with no space as the comment Postgres says it is", () => {
    // Bug 1: the old pattern required whitespace after the dashes, so this survived stripping and
    // satisfied the "must read the view" assertion while reading nothing.
    const stripped = stripComments("const q = `SELECT 1\n--FROM booked_revenue\n`")
    expect(
      /FROM booked_revenue/.test(stripped),
      "a commented-out view read must not satisfy the required-view assertion",
    ).toBe(false)
  })

  it("does not swallow the line after an empty comment", () => {
    // Bug 2: `\s` matched the newline, so `.*$` ate the next line whole -- taking a forbidden
    // raw-revenue sum with it.
    const stripped = stripComments("SELECT 1\n--\nSUM(revenue) FROM sales_records\n")
    expect(
      /SUM\(revenue\)\s*FROM sales_records/.test(stripped),
      "an empty -- comment deleted the following line, hiding exactly what this guard forbids",
    ).toBe(true)
  })

  it("still refuses to treat a decrement as a comment", () => {
    // The reason the leading (^|\s) is kept. Removing it would strip the rest of these lines.
    for (const code of ["let i = n; i--; useIt(i)", "while (--attempts) { retry() }"]) {
      expect(stripComments(code)).toContain(code.includes("useIt") ? "useIt(i)" : "retry()")
    }
  })

  it("still strips an ordinary SQL comment", () => {
    expect(stripComments("SELECT 1 -- FROM booked_revenue\n")).not.toMatch(/FROM booked_revenue/)
  })
})

describe("revenue comes from booked_revenue", () => {
  it("finds files under every scanned root", () => {
    // A path change that silently matched nothing would make every assertion below vacuous.
    // Asserted PER ROOT, not on the total: `lib` alone clears 20, so a broken `app/api` path would
    // still satisfy a single total and quietly take 137 routes out of coverage.
    for (const root of SCAN_ROOTS) {
      const prefix = path.relative(REPO_ROOT, root)
      const found = routes.filter((r) => r.rel.startsWith(`${prefix}${path.sep}`))
      expect(found.length, `no .ts files found under ${prefix}`).toBeGreaterThan(20)
    }
  })

  it("nothing totals revenue straight from sales_records or other_sales_records", () => {
    const offenders = routes
      .filter((r) => !ALLOWED_RAW_READERS.has(r.rel))
      .filter((r) => sumsRawRevenue(r.body))
      .map((r) => r.rel)

    expect(offenders).toEqual([])
  })

  it("the files that report revenue actually read the view", () => {
    // Named explicitly: the six that were wrong, the two that were right, and the four agents the
    // old `app/api`-only scan could not see. If one is renamed or removed, this fails and asks a
    // human what happened, rather than quietly reducing its own coverage to nothing.
    const mustUseView = [
      "app/api/season-pl/route.ts",
      "app/api/season-summary/route.ts",
      "app/api/finance-balance-sheet/route.ts",
      "app/api/dashboard/cost-per-kg/route.ts",
      "app/api/intelligence-brief/route.ts",
      "app/api/ai-season-compare/route.ts",
      "app/api/exception-alerts/route.ts",
      "app/api/admin/weekly-summary/route.ts",
      // The four that went out by email while this test passed.
      "lib/server/agents/weekly-digest-agent.ts",
      "lib/server/agents/daily-digest-agent.ts",
      "lib/server/agents/digest-estate-breakdown.ts",
      "lib/server/coffee-prices.ts",
    ]

    for (const rel of mustUseView) {
      const route = routes.find((r) => r.rel === rel)
      expect(route, `${rel} not found — was it renamed?`).toBeDefined()
      // A READ, not a mention. `FROM`/`JOIN booked_revenue` is the SQL equivalent of the
      // `helper\s*\(` rule CLAUDE.md gives for function guards: a bare /booked_revenue/ is
      // satisfied by any sentence that happens to name the view, including this one.
      expect(route!.body, `${rel} must SELECT FROM booked_revenue`).toMatch(
        /\b(?:FROM|JOIN)\s+booked_revenue\b/i,
      )
    }
  })

  it("the ops export still goes through the shared P&L definition", () => {
    // exports/ops builds its own grouped queries, so the view alone does not cover it; the
    // arithmetic still has to come from computeNetPnl.
    const ops = routes.find((r) => r.rel === "app/api/exports/ops/route.ts")
    expect(ops).toBeDefined()
    expect(ops!.body).toMatch(/computeNetPnl/)
  })
})
