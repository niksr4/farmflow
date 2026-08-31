import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every upsert into current_inventory must repeat the partial index's own predicate.
 *
 * THE BUG THIS EXISTS FOR. current_inventory's unique indexes are partial:
 *
 *   uq_current_inventory_item_tenant_location       (item_type, tenant_id, location_id)
 *                                                   WHERE location_id IS NOT NULL
 *   uq_current_inventory_item_tenant_null_location  (item_type, tenant_id)
 *                                                   WHERE location_id IS NULL
 *
 * Postgres matches a partial index only when the ON CONFLICT target repeats its WHERE clause.
 * Omit it and the statement fails at PLAN time -- "there is no unique or exclusion constraint
 * matching the ON CONFLICT specification" -- taking the whole surrounding transaction with it.
 *
 * app/api/expenses-neon wrote the located arm without the predicate. Every expense mutation
 * recalculates the affected stock, so deleting an expense rolled back and came back on reload
 * (the row hides behind the undo toast first, so it looked like it had worked), and editing one
 * failed outright with "Failed to process expense". Reported by HoneyFarm 2026-08-31, visible in
 * Sentry as [expense_update] x4 and [expense_delete] x3 from 2026-08-29.
 *
 * WHY IT SURVIVED SO LONG. The NULL arm was always correct. The broken arm only runs when the
 * stock line has a location, so while tenants still held stock in the unassigned pool the working
 * branch is the one that ran. Merging that pool into named stores gave every line a location and
 * turned a dormant bug into a total outage of expense editing -- a fix to one thing detonating
 * another, which no test asserted against.
 *
 * Counting sites rather than testing behaviour is deliberate: five of the six call sites were
 * always right, and a behavioural test over those five would have passed while the sixth was
 * breaking production.
 */

const API = resolve(__dirname, "../app/api")

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : entry === "route.ts" ? [full] : []
  })

/** Every `ON CONFLICT ...` target aimed at current_inventory's key columns, with its file. */
const conflictTargets = () => {
  const found: Array<{ file: string; target: string }> = []
  for (const file of walk(API)) {
    const source = readFileSync(file, "utf8")
    // Matches both the literal form and the interpolated `ON CONFLICT ${conflictTarget}` --
    // for the latter the target is built above, so the built strings are captured too.
    for (const match of source.matchAll(/\(item_type, tenant_id(?:, location_id)?\)[^\n`]*/g)) {
      found.push({ file: file.slice(file.indexOf("app/api")), target: match[0].trim() })
    }
  }
  return found
}

describe("current_inventory upserts name a real index", () => {
  const targets = conflictTargets()

  it("finds the call sites at all, so a rewrite cannot silently disarm this", () => {
    expect(targets.length).toBeGreaterThanOrEqual(6)
  })

  it("every three-column target carries WHERE location_id IS NOT NULL", () => {
    const broken = targets
      .filter((t) => t.target.startsWith("(item_type, tenant_id, location_id)"))
      .filter((t) => !/WHERE location_id IS NOT NULL/.test(t.target))
    expect(
      broken.map((t) => `${t.file}: ${t.target}`),
      "a three-column ON CONFLICT without the predicate cannot match the partial index and fails at plan time",
    ).toEqual([])
  })

  it("every two-column target carries WHERE location_id IS NULL", () => {
    const broken = targets
      .filter((t) => /^\(item_type, tenant_id\)/.test(t.target))
      .filter((t) => !/WHERE location_id IS NULL/.test(t.target))
    expect(broken.map((t) => `${t.file}: ${t.target}`)).toEqual([])
  })

  it("the expense recalculation in particular picks the arm by location", () => {
    // The specific regression. Both arms present, each with its own predicate.
    const route = readFileSync(resolve(API, "expenses-neon/route.ts"), "utf8")
    expect(route).toContain("(item_type, tenant_id, location_id) WHERE location_id IS NOT NULL")
    expect(route).toContain("(item_type, tenant_id) WHERE location_id IS NULL")
  })
})
