import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every query against booked_revenue must ask only for columns the view has.
 *
 * THE BUG THIS EXISTS FOR. scripts/121 gave revenue one definition and pointed eleven routes at a
 * view. The view resolves four kilo columns into one and, until scripts/144, exposed no produce or
 * bag type at all -- but three of those routes were not merely summing money, they were breaking
 * the sale down. They kept the SELECT list they had written against sales_records, so every load
 * for every tenant returned `column "coffee_type" does not exist`:
 *
 *   season-summary      the whole "This season" tab, dead since 121
 *   exception-alerts    two of its comparison windows
 *   intelligence-brief  the dispatch-vs-sold reconciliation
 *
 * A missing column is a runtime failure. Typecheck cannot see inside a SQL string, lint cannot,
 * and the build cannot -- so the only thing standing between a copied SELECT list and a 500 in
 * production is a check like this one. scripts/dev/api-smoke.mjs catches it too, but only when
 * somebody remembers to run it against a live server.
 *
 * It is written as a blocklist rather than an allowlist because the failure has a shape: a query
 * copied off sales_records or other_sales_records, keeping columns that only exist there. Naming
 * those columns catches the next copy. Aliases are stripped first -- `produce_type AS coffee_type`
 * is the correct way to keep a downstream key name, not a violation.
 */

const API = resolve(__dirname, "../app/api")

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : entry === "route.ts" ? [full] : []
  })

/** Columns that exist on sales_records or other_sales_records but NOT on the view. */
const NOT_ON_THE_VIEW = [
  "coffee_type", // -> produce_type, and it is not always coffee
  "asset_type", // -> produce_type
  "kgs_received",
  "weight_kgs",
  "kgs_sent",
  "kgs_sold",
  "bags_sent",
  "total_revenue",
  "price_per_kg",
  "price_per_bag",
  "rate_per_kg",
  "contract_amount",
  "sale_mode",
  "batch_no",
]

/**
 * The SQL literal a `FROM booked_revenue` sits in: back to its SELECT, forward to the closing
 * backtick. Both `sql\`...\`` and `sql.query(\`...\`)` end that way, and the SQL bodies contain no
 * backticks of their own -- a comment that used one was a syntax error caught by tsc.
 */
const bookedRevenueQueries = (source: string) => {
  const found: string[] = []
  let at = source.indexOf("FROM booked_revenue")
  while (at !== -1) {
    const start = source.lastIndexOf("SELECT", at)
    const end = source.indexOf("`", at)
    found.push(source.slice(start, end === -1 ? at : end))
    at = source.indexOf("FROM booked_revenue", at + 1)
  }
  return found
}

const stripAliases = (sqlText: string) => sqlText.replace(/\bAS\s+\w+/gi, "")

describe("booked_revenue callers ask for columns the view has", () => {
  const routes = walk(API).filter((file) => readFileSync(file, "utf8").includes("FROM booked_revenue"))

  it("finds the callers at all, so a rename cannot quietly disarm this test", () => {
    expect(routes.length).toBeGreaterThanOrEqual(7)
  })

  for (const file of routes) {
    const short = file.slice(file.indexOf("app/api"))
    it(`${short} reads only view columns`, () => {
      const queries = bookedRevenueQueries(readFileSync(file, "utf8"))
      expect(queries.length).toBeGreaterThan(0)
      for (const query of queries) {
        const readable = stripAliases(query)
        for (const column of NOT_ON_THE_VIEW) {
          // Comments legitimately name these columns to explain why they are gone, so only the
          // SQL itself is checked -- comment lines start with `--`.
          const sqlOnly = readable
            .split("\n")
            .filter((line) => !line.trim().startsWith("--"))
            .join("\n")
          expect(sqlOnly, `${short} selects ${column}, which booked_revenue does not have`).not.toMatch(
            new RegExp(`\\b${column}\\b`),
          )
        }
      }
    })
  }
})

describe("the view exposes what scripts/144 promises", () => {
  const migration = readFileSync(resolve(__dirname, "../scripts/144-booked-revenue-produce-type.sql"), "utf8")

  it("adds produce_type, bag_type and lot_id to both arms", () => {
    // Both arms, or the UNION does not typecheck in Postgres and the migration fails loudly --
    // but a missing NULL::text placeholder is easy to write and worth naming here.
    for (const column of ["produce_type", "bag_type", "lot_id"]) {
      expect((migration.match(new RegExp(`AS ${column}\\b`, "g")) ?? []).length).toBe(2)
    }
  })

  it("keeps the view security_invoker, which is what stops it leaking across tenants", () => {
    expect(migration).toContain("security_invoker = true")
    expect(migration).toContain("must be security_invoker")
  })
})

describe("pepper is not counted as coffee", () => {
  const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8")

  it("the reconciliation routes pin themselves to source = 'sale'", () => {
    // These three compare what was sold against what was processed or dispatched. Pepper is never
    // dispatched, so counting it there reads as coffee sold out of stock that does not exist --
    // exception-alerts would raise "sold volume exceeds processed output" on an estate that simply
    // sold pepper. Revenue totals elsewhere do want both arms, which is why this is per-query.
    expect(read("app/api/exception-alerts/route.ts")).toContain("sr.source = 'sale'")
    expect(read("app/api/intelligence-brief/route.ts")).toContain("source = 'sale'")
    expect(read("app/api/season-summary/route.ts")).toContain('row.source !== "other_sale"')
  })

  it("the season summary still counts other produce in the money", () => {
    const route = read("app/api/season-summary/route.ts")
    expect(route).toContain("const bookedRevenue = coffeeRevenue + otherSalesRevenue")
    expect(route).toContain("cashIn: bookedRevenue")
  })
})
