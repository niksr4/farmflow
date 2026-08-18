import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Cost has two halves, and a total that sees only one is wrong in the safe-looking direction.
 *
 * This is the companion to revenue-single-source.test.ts, and it exists because the same class
 * of fault has now happened three times in this codebase:
 *
 *   - muster allocations written by a tenant with no cutover: saved, counted by nothing
 *   - other_sales_records: six routes blind to Rs 12,12,380 of pepper revenue
 *   - picking_records: piece-rate harvest pay in no P&L line at all
 *
 * Every one was "money written where some reader cannot see it". Revenue was closed by putting
 * it behind a view. Cost is not refactored the same way on purpose: labour_cost is already a
 * view and expense_transactions is a single table with a single money column, so the definitions
 * are not in doubt -- what is in doubt is whether a *new* route remembers to read both. Pointing
 * fifty existing queries at estate_cost to prove a point would have renamed the date and amount
 * columns under each of them, and SQL that no typecheck can see is a poor trade for a guarantee
 * a test gives directly.
 *
 * scripts/123 still creates estate_cost, which is what new code should read.
 */

const API_ROOT = path.resolve(__dirname, "../app/api")

/**
 * Routes allowed to total expenses without labour: they are the expense surface itself, not a
 * statement of what the estate spent.
 */
const EXPENSE_ONLY_ROUTES = new Set(["expenses-neon/route.ts"])

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

const totalsExpenses = (body: string) =>
  /SUM\(\s*(?:[a-z_]+\.)?total_amount\s*\)/i.test(body) && /\bFROM\s+expense_transactions\b/i.test(body)

const readsLabour = (body: string) => /\b(labour_cost|estate_cost)\b/.test(body)

describe("cost is never counted by halves", () => {
  it("finds the API routes at all", () => {
    expect(routes.length).toBeGreaterThan(20)
  })

  it("no route totals expenses without also reading labour", () => {
    const offenders = routes
      .filter((r) => !EXPENSE_ONLY_ROUTES.has(r.rel))
      .filter((r) => totalsExpenses(r.body) && !readsLabour(r.body))
      .map((r) => r.rel)

    expect(offenders).toEqual([])
  })

  it("the routes that report a cost total read both halves", () => {
    // Named rather than inferred: if one is renamed this fails and asks a human, instead of
    // quietly shrinking its own coverage to nothing.
    const mustReadBoth = [
      "season-pl/route.ts",
      "season-summary/route.ts",
      "finance-balance-sheet/route.ts",
      "accounts-totals/route.ts",
      "accounts-summary/route.ts",
      "dashboard/cost-per-kg/route.ts",
      "dashboard/estate-pulse/route.ts",
      "intelligence-brief/route.ts",
      "ai-season-compare/route.ts",
      "admin/weekly-summary/route.ts",
    ]

    for (const rel of mustReadBoth) {
      const route = routes.find((r) => r.rel === rel)
      expect(route, `${rel} not found — was it renamed?`).toBeDefined()
      expect(route!.body, `${rel} must read a labour source`).toMatch(/\b(labour_cost|estate_cost)\b/)
      expect(route!.body, `${rel} must read expenses`).toMatch(/\b(expense_transactions|estate_cost)\b/)
    }
  })

  it("the shared P&L definition cannot grow an inventory term", () => {
    // Stock bought is an asset; stock consumed is already carried by the expense entry that
    // consumed it, so either one added to outflow counts the same rupee twice. Rather than
    // guess at arithmetic with a regex — which flagged two routes that were provably correct —
    // this pins the one definition both P&L callers go through.
    const pnl = readFileSync(path.resolve(__dirname, "../lib/server/pnl.ts"), "utf8")

    expect(pnl).toMatch(/totalOutflow\s*=\s*input\.laborCost\s*\+\s*input\.expenseCost/)
    expect(pnl).not.toMatch(/inventor/i)
    expect(pnl).not.toMatch(/restock|deplete|transaction_history/i)

    // And the declared table lists stay the two-and-two they are named for.
    expect(pnl).toMatch(/PNL_OUTFLOW_TABLES = \["labour_cost", "expense_transactions"\]/)
    expect(pnl).toMatch(/PNL_REVENUE_TABLES = \["sales_records", "other_sales_records"\]/)
  })

  it("inventory money totals exclude the price-correction rows", () => {
    // Correcting an item's price once wrote a full deplete-and-restock pair valued at the whole
    // holding. 59 such rows survive on one tenant and are 70% of the money in their ledger, so
    // any total that counts them is describing a price edit as trade: "stock purchases" read
    // Rs 14,86,864 instead of Rs 6,44,431, and "depletion for losses" Rs 9,50,350 instead of
    // Rs 87,207. The writer is gone; the rows are not, and never will be — they are load-bearing
    // for balances that reconcile exactly against the ledger.
    // Checked per QUERY, not per file. exports/ops contains both a row-level inventory export
    // (which should show every row, reprices included — the note explains what they are) and a
    // labour SUM elsewhere; a file-level regex conflates the two and flags a correct export.
    const offenders: string[] = []
    for (const route of routes) {
      for (const match of route.body.matchAll(/\bFROM\s+transaction_history\b/gi)) {
        // Only this query's own SELECT list. A fixed lookback bleeds into the previous query in
        // multi-query files and flags reconciliation, which fetches ledger ROWS (no aggregate)
        // and must keep the reprice rows — they are real movements, and dropping them would
        // break the very balance replay that check exists to run.
        const head = route.body.slice(0, match.index!)
        const selectAt = head.toUpperCase().lastIndexOf("SELECT")
        const selectClause = selectAt === -1 ? "" : head.slice(selectAt)
        // Bounded to THIS query's SQL. A fixed forward window ran past the closing backtick and
        // picked up the next query's filter, so removing a real filter still passed — a test
        // that cannot fail is worse than no test. Verified by deleting one and watching it go red.
        const tail = route.body.slice(match.index!)
        const stop = Math.min(
          ...[tail.indexOf("`"), tail.toUpperCase().indexOf("SELECT", 1)]
            .filter((i) => i > 0)
            .concat([tail.length]),
        )
        const whereClause = tail.slice(0, stop)

        const aggregatesMoney = /SUM\s*\(/i.test(selectClause) && /total_cost/i.test(selectClause)
        if (!aggregatesMoney) continue
        if (/NOT ILIKE 'Price updated%'/.test(whereClause)) continue
        offenders.push(route.rel)
      }
    }

    expect([...new Set(offenders)]).toEqual([])
  })

  it("labour still reaches cost through labour_cost, never the raw tables", () => {
    // labor_transactions and labour_assignments are the two entry methods; reading either
    // directly for money skips the cutover logic that decides which one a date belongs to.
    // payroll-summary answers "what do I owe each worker", and reconciliation looks for
    // attendance with no allocation. Both are about individual rows rather than a cost total,
    // so both must read labour_assignments directly — the cutover-resolved view has already
    // collapsed exactly the detail they need.
    const RAW_LABOUR_ALLOWED = new Set([
      "attendance/assignments/route.ts",
      "labor-neon/route.ts",
      "payroll-summary/route.ts",
      "reconciliation/route.ts",
    ])

    const offenders = routes
      .filter((r) => !r.rel.startsWith("attendance/") && !RAW_LABOUR_ALLOWED.has(r.rel))
      .filter(
        (r) =>
          /SUM\(\s*(?:[a-z_]+\.)?total_cost\s*\)/i.test(r.body) &&
          /\bFROM\s+(labor_transactions|labour_assignments)\b/i.test(r.body),
      )
      .map((r) => r.rel)

    expect(offenders).toEqual([])
  })
})
