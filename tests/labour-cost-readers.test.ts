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
  ["app/api/ai-validate/route.ts", "audits the raw rows for bad data"],
  ["app/api/admin/tenant-activity/route.ts", "joins audit_logs on the legacy row id"],
  ["lib/tenant-deletion.ts", "deletes rows"],
  ["components/tenant-settings/utils.ts", "names the table in a deletion summary"],
  // Reads both tables by name because it asks "did a human write anything", and after a cutover
  // that answer lives in labour_assignments. Listed separately in ACTIVITY_TABLES.
  ["lib/server/agents/tenant-dormancy.ts", "activity signal over both tables"],
  // Counts rows to answer "has this block ever been used", which is a different question from
  // "what did labour cost". The cutover rule does not apply: a block is not deletable if ANY
  // entry references it, whichever side of a cutover that entry happens to fall on, and going
  // through labour_cost would hide exactly the legacy rows that make deletion unsafe.
  ["app/api/locations/route.ts", "counts usage before allowing a block to be deleted"],
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

// Comments stripped before the check. A file that only NAMES labor_transactions while explaining
// why the view exists is not a reader of it, and flagging one teaches the reader to add allowlist
// entries instead of thinking -- which is how a guard stops guarding. (Third test this week with
// this defect: the same fix went into crop-config and activity-contracts.)
const codeOf = (file: string) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")

describe("labour cost is read through the view", () => {
  const root = process.cwd()
  const files = ["app", "lib", "components"].flatMap((d) => walk(join(root, d)))

  it("has no unlisted reader touching labor_transactions", () => {
    const offenders = files
      .filter((f) => codeOf(f).includes("labor_transactions"))
      .map((f) => f.slice(root.length + 1))
      .filter((rel) => !ALLOWED.has(rel))

    expect(offenders).toEqual([])
  })

  it("keeps the allowlist honest -- every entry still references the table", () => {
    // An allowlist entry that no longer applies is a hole waiting for the next edit to fall into.
    const stale = [...ALLOWED.keys()].filter((rel) => {
      try {
        return !codeOf(join(root, rel)).includes("labor_transactions")
      } catch {
        return true
      }
    })
    expect(stale).toEqual([])
  })
})
