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

const API_ROOT = path.resolve(__dirname, "../app/api")

/** Routes allowed to read the underlying tables: they are the CRUD surface for them. */
const ALLOWED_RAW_READERS = new Set([
  "sales/route.ts",
  "other-sales/route.ts",
  // Reads created_at only, as one arm of a "when did anything last happen" union.
  "dashboard/estate-pulse/route.ts",
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

const routes = walk(API_ROOT).map((file) => ({
  rel: path.relative(API_ROOT, file),
  body: readFileSync(file, "utf8"),
}))

/** Does this file total up money from a table rather than from the view? */
const sumsRawRevenue = (body: string) =>
  /SUM\(\s*(?:[a-z_]+\.)?(?:revenue|total_revenue|contract_amount)\s*\)/i.test(body) &&
  /\bFROM\s+(sales_records|other_sales_records)\b/i.test(body)

describe("revenue comes from booked_revenue", () => {
  it("finds the API routes at all", () => {
    // A path change that silently matched nothing would make every assertion below vacuous.
    expect(routes.length).toBeGreaterThan(20)
  })

  it("no route totals revenue straight from sales_records or other_sales_records", () => {
    const offenders = routes
      .filter((r) => !ALLOWED_RAW_READERS.has(r.rel))
      .filter((r) => sumsRawRevenue(r.body))
      .map((r) => r.rel)

    expect(offenders).toEqual([])
  })

  it("the routes that report revenue actually read the view", () => {
    // Named explicitly: these are the six that were wrong, plus the two that were right.
    // If one is renamed or removed, this fails and asks a human what happened, rather than
    // quietly reducing its own coverage to nothing.
    const mustUseView = [
      "season-pl/route.ts",
      "season-summary/route.ts",
      "finance-balance-sheet/route.ts",
      "dashboard/cost-per-kg/route.ts",
      "intelligence-brief/route.ts",
      "ai-season-compare/route.ts",
      "exception-alerts/route.ts",
      "admin/weekly-summary/route.ts",
    ]

    for (const rel of mustUseView) {
      const route = routes.find((r) => r.rel === rel)
      expect(route, `${rel} not found — was it renamed?`).toBeDefined()
      expect(route!.body, `${rel} must read booked_revenue`).toMatch(/\bbooked_revenue\b/)
    }
  })

  it("the ops export still goes through the shared P&L definition", () => {
    // exports/ops builds its own grouped queries, so the view alone does not cover it; the
    // arithmetic still has to come from computeNetPnl.
    const ops = routes.find((r) => r.rel === "exports/ops/route.ts")
    expect(ops).toBeDefined()
    expect(ops!.body).toMatch(/computeNetPnl/)
  })
})
