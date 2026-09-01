/**
 * Correct the worker-days booked at more than one day, per an explicit decision per day.
 *
 * WHY THIS TAKES INSTRUCTIONS INSTEAD OF WORKING IT OUT. The obvious repair -- "delete the second
 * batch, it was the accident" -- is wrong, and the data says so plainly. On every affected day
 * there is a group who legitimately did only one of the two jobs:
 *
 *   HoneyFarm 29 Aug   136 (17 workers) + 158 (20)   17 doubled, 3 did only 158
 *   HoneyFarm 31 Aug   136 (19)         + 139 (21)   19 doubled, 2 did only 139
 *   HoneyFarm  1 Sep   156 (22)         + 211 (24)   21 doubled, 1 did only 156, 3 only 211
 *   HoneyFarm 27 Aug   211 (3)          + 136 (24)    3 doubled -- a real 3-person clearing crew
 *   Seshagiri 28 Aug   201 (3) + 151 (19) + 201 again at another block (4)   3 doubled
 *
 * Dropping a whole batch would delete real work for those people. And for the doubled ones, both
 * rows look equally deliberate -- a chosen code, a chosen block, ninety seconds apart. Nothing in
 * the database distinguishes "he meant this one" from "he meant that one". Only the writer knows.
 *
 * So this script does what it is told, and nothing else.
 *
 * USAGE
 *   node scripts/dev/fix-overbooked-days.mjs                 # dry run against prod, changes nothing
 *   node scripts/dev/fix-overbooked-days.mjs --apply         # writes, after taking a backup
 *
 * Edit DECISIONS below. Two verbs:
 *   { action: "half"  }             both jobs become half a day. Nothing is lost; use when they
 *                                   genuinely did both. Keeps block and code attribution.
 *   { action: "drop", code: "211" } remove that code's row FOR THE DOUBLED WORKERS ONLY. People
 *                                   who did only that job keep theirs.
 *
 * Every deleted row is written to scripts/dev/overbooked-backup-<stamp>.json first, so any of this
 * can be put back.
 */
import { writeFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

/** @type {Array<{tenant: string, date: string, action: "half"|"drop", code?: string}>} */
const DECISIONS = [
  // Filled in once the estates say which job the doubled people actually did. Example:
  // { tenant: "HoneyFarm", date: "2026-09-01", action: "drop", code: "211" },
  // { tenant: "Seshagiri", date: "2026-08-31", action: "half" },
]

const APPLY = process.argv.includes("--apply")
const sql = neon(process.env.DATABASE_URL)

const doubledWorkers = (tenantId, date) => sql`
  SELECT worker_id FROM labour_assignments
  WHERE tenant_id = ${tenantId} AND work_date = ${date}
  GROUP BY worker_id HAVING SUM(day_fraction) > 1.0001`

const backup = []
let touched = 0

if (DECISIONS.length === 0) {
  console.log("No decisions listed. Run scripts/dev/overbooked-batches.mjs to see the days, then")
  console.log("fill in DECISIONS at the top of this file.\n")
}

for (const d of DECISIONS) {
  const [t] = await sql`SELECT id FROM tenants WHERE name = ${d.tenant}`
  if (!t) { console.log(`  ?? no tenant "${d.tenant}"`); continue }
  const ids = (await doubledWorkers(t.id, d.date)).map((r) => r.worker_id)
  if (ids.length === 0) { console.log(`  -- ${d.tenant} ${d.date}: nothing over a day`); continue }

  const rows = await sql`
    SELECT la.*, w.full_name FROM labour_assignments la
    JOIN attendance_workers w ON w.id = la.worker_id
    WHERE la.tenant_id = ${t.id} AND la.work_date = ${d.date} AND la.worker_id = ANY(${ids})
    ORDER BY w.full_name, la.created_at`

  if (d.action === "half") {
    console.log(`  ${d.tenant} ${d.date}: ${ids.length} workers -> both jobs to half a day (${rows.length} rows)`)
    if (APPLY) {
      // Down first, so the cap in scripts/145 never sees an intermediate total over one day.
      await sql`UPDATE labour_assignments SET day_fraction = 0.5, updated_at = NOW()
                WHERE tenant_id = ${t.id} AND work_date = ${d.date} AND worker_id = ANY(${ids})`
    }
    touched += rows.length
  } else if (d.action === "drop") {
    const doomed = rows.filter((r) => r.activity_code === d.code)
    console.log(`  ${d.tenant} ${d.date}: drop code ${d.code} from ${doomed.length} doubled workers ` +
                `(${rows.length - doomed.length} rows on the other job stay)`)
    backup.push(...doomed)
    if (APPLY && doomed.length) {
      await sql`DELETE FROM labour_assignments WHERE id = ANY(${doomed.map((r) => r.id)})`
    }
    touched += doomed.length
  }
}

if (APPLY && backup.length) {
  const path = `scripts/dev/overbooked-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  writeFileSync(path, JSON.stringify(backup, null, 2))
  console.log(`\nbacked up ${backup.length} deleted rows to ${path}`)
}
console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"} — ${touched} rows ${APPLY ? "changed" : "would change"}`)
