import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Labour money is read through the labour_cost view, never off labor_transactions.
 *
 * scripts/117 exists because the cutover rule -- which of the two entry methods owns a given
 * date for a given tenant -- was going to be duplicated into seventeen callers. The failure mode
 * is quiet and expensive: a reader that goes straight to the table reports a switched tenant's
 * labour as zero, and a zero looks exactly like a slow week. This test is what stops the
 * eighteenth reader, written by someone who has never heard of tenant_labour_entry_mode.
 *
 * The allowlist is deliberately short, and every entry earns its place by writing to the table
 * or by owning rows that must stay individually editable.
 */

const ALLOWED = new Map<string, string>([
  // Owns the legacy rows: lists them by id so they can be edited and deleted. View rows have no
  // updatable identity, so this one reads the table on purpose.
  ["app/api/labor-neon/route.ts", "CRUD on the legacy rows themselves"],
  ["app/api/import-bulk/route.ts", "writes rows"],
  ["app/api/admin/seed-tenant/route.ts", "writes demo rows"],
  ["app/api/get-activity/route.ts", "rewrites activity codes on the rows"],
  ["lib/tenant-deletion.ts", "deletes rows"],
  ["components/tenant-settings/utils.ts", "names the table in a deletion summary"],
  ["lib/server/pnl.ts", "names relations in a comment"],
  // Activity signals, not money: these ask "did anything get written", and after a cutover the
  // muster path answers through labour_assignments. Tracked separately from cost reporting.
  ["lib/server/agents/tenant-dormancy.ts", "activity signal"],
  ["lib/server/agents/tenant-engagement-agent.ts", "activity signal"],
  ["app/api/activity-streak/route.ts", "activity signal"],
  ["app/api/recent-activity/route.ts", "activity feed"],
  ["app/api/admin/tenant-activity/route.ts", "activity feed"],
  ["app/api/search/route.ts", "activity feed"],
  ["app/api/dashboard/hints/route.ts", "activity signal"],
  ["app/api/ai-charts-data/route.ts", "activity signal"],
  ["app/api/ai-validate/route.ts", "checks the raw rows"],
])

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe("labour cost is read through the view", () => {
  const root = process.cwd()
  const files = ["app", "lib", "components"].flatMap((d) => walk(join(root, d)))

  it("has no unlisted reader touching labor_transactions", () => {
    const offenders = files
      .filter((f) => readFileSync(f, "utf8").includes("labor_transactions"))
      .map((f) => f.slice(root.length + 1))
      .filter((rel) => !ALLOWED.has(rel))

    expect(offenders).toEqual([])
  })

  it("keeps the allowlist honest -- every entry still references the table", () => {
    // An allowlist entry that no longer applies is a hole waiting for the next edit to fall into.
    const stale = [...ALLOWED.keys()].filter((rel) => {
      try {
        return !readFileSync(join(root, rel), "utf8").includes("labor_transactions")
      } catch {
        return true
      }
    })
    expect(stale).toEqual([])
  })
})
