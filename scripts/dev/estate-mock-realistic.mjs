/**
 * Makes Estate Mock look like an estate rather than a test fixture.
 *
 * Run: node --env-file=.env.local scripts/dev/estate-mock-realistic.mjs
 *
 * Repeated e2e runs left it with codes like UIT9PQT5R and blocks called "UI Test Block 8MFNVX",
 * which is fine for assertions and useless for showing anyone. This seeds the same 80 activity
 * codes a real tenant is provisioned with, moves the existing rows onto sensible ones, and gives
 * the blocks names an estate would recognise.
 *
 * Order matters: labor_transactions and expense_transactions both have a foreign key onto
 * account_activities(code, tenant_id), so every row has to be moved off a test code before that
 * code can be dropped. Dev only -- it rewrites existing rows in place.
 */

import { neon } from "@neondatabase/serverless"
import { ACCOUNT_ACTIVITY_SUGGESTIONS } from "../../lib/account-activity-suggestions.ts"

const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id

// Field work a muster roll actually allocates against, and inputs an expense sits under. Estate
// Mock is a playground, so the old rows are spread across these rather than reconstructed -- the
// point is that the screens read like an estate, not that this history is true.
const FIELD = ["131", "132", "137", "140", "151", "152", "157", "160", "182"]
const OVERHEAD = ["219", "221", "245", "210", "216", "217", "211", "200", "206"]

// Five extra named blocks so the screens read like a real estate rather than three codes.
//
// These used to be RENAMES of leftover "UI Test Block …" rows, which meant this harness silently
// did nothing the moment that litter was cleaned up -- and estate-mock-a-day.mjs, which allocates
// against RS/OA/PL, would then fail on codes that no longer resolved. They are created outright
// now, so the harness does not depend on debris from an earlier run.
//
// Split across both estates, since Estate Mock mirrors HoneyFarm's two-estate shape.
const BLOCKS = [
  ["Riverside", "RS", "Honeyfarm"],
  ["Lower Valley", "LV", "Honeyfarm"],
  ["Nursery", "NUR", "Sidapur"],
  ["Old Arabica", "OA", "Sidapur"],
  ["Pepper Line", "PL", "Sidapur"],
]

console.log("== seeding the 80 default activity codes ==")
let added = 0
for (const { code, reference } of ACCOUNT_ACTIVITY_SUGGESTIONS) {
  const done = await sql`
    INSERT INTO account_activities (tenant_id, code, activity)
    VALUES (${T}, ${code}, ${reference})
    ON CONFLICT (tenant_id, code) DO NOTHING
    RETURNING code`
  if (done.length) added++
}
console.log(`  added ${added}, ${ACCOUNT_ACTIVITY_SUGGESTIONS.length - added} already present`)

// Only codes that actually exist can be assigned; fall back to the first field code otherwise.
const present = new Set(
  (await sql`SELECT code FROM account_activities WHERE tenant_id=${T}`).map((r) => String(r.code)),
)
const pick = (list, i) => list.filter((c) => present.has(c))[i % list.filter((c) => present.has(c)).length]

console.log("\n== moving rows off the test codes ==")
const junkLabour = (await sql`
  SELECT DISTINCT code FROM labor_transactions WHERE tenant_id=${T} AND code LIKE 'UIT%' ORDER BY code`)
for (const [i, r] of junkLabour.entries()) {
  const to = pick(FIELD, i)
  const moved = await sql`
    UPDATE labor_transactions SET code=${to} WHERE tenant_id=${T} AND code=${r.code} RETURNING id`
  console.log(`  labour   ${r.code} -> ${to}  (${moved.length} rows)`)
}

const junkExpense = (await sql`
  SELECT DISTINCT code FROM expense_transactions WHERE tenant_id=${T} AND code LIKE 'UIE%' ORDER BY code`)
for (const [i, r] of junkExpense.entries()) {
  const to = pick(OVERHEAD, i)
  const moved = await sql`
    UPDATE expense_transactions SET code=${to} WHERE tenant_id=${T} AND code=${r.code} RETURNING id`
  console.log(`  expense  ${r.code} -> ${to}  (${moved.length} rows)`)
}

console.log("\n== dropping the now-unused test codes ==")
const dropped = await sql`
  DELETE FROM account_activities
  WHERE tenant_id=${T}
    AND (code LIKE 'UIT%' OR code LIKE 'UIE%')
    AND NOT EXISTS (SELECT 1 FROM labor_transactions l WHERE l.tenant_id=${T} AND l.code = account_activities.code)
    AND NOT EXISTS (SELECT 1 FROM expense_transactions e WHERE e.tenant_id=${T} AND e.code = account_activities.code)
    AND NOT EXISTS (SELECT 1 FROM labour_assignments a WHERE a.tenant_id=${T} AND a.activity_code = account_activities.code)
  RETURNING code`
console.log(`  dropped ${dropped.length}: ${dropped.map((r) => r.code).join(", ") || "none"}`)

console.log("\n== naming the blocks ==")
for (const [name, code, estate] of BLOCKS) {
  await sql`
    INSERT INTO locations (tenant_id, name, code, estate, kind)
    VALUES (${T}, ${name}, ${code}, ${estate}, 'block')
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, estate=EXCLUDED.estate`
  console.log(`  ${name} (${code}) on ${estate}`)
}

console.log("\n== result ==")
const codes = await sql`SELECT COUNT(*)::int n FROM account_activities WHERE tenant_id=${T}`
const junkLeft = await sql`
  SELECT COUNT(*)::int n FROM account_activities WHERE tenant_id=${T} AND (code LIKE 'UIT%' OR code LIKE 'UIE%')`
console.log(`  ${codes[0].n} activity codes, ${junkLeft[0].n} still looking like test data`)
const locs = await sql`SELECT name, code, estate FROM locations WHERE tenant_id=${T} ORDER BY estate, name`
locs.forEach((l) => console.log(`  block ${String(l.name).padEnd(14)} ${String(l.code).padEnd(5)} ${l.estate}`))
const used = await sql`
  SELECT lc.activity_code, MAX(aa.activity) AS name, COUNT(*)::int n, SUM(lc.total_cost)::numeric c
  FROM labour_cost lc LEFT JOIN account_activities aa ON aa.code=lc.activity_code AND aa.tenant_id=lc.tenant_id
  WHERE lc.tenant_id=${T} GROUP BY 1 ORDER BY 1`
console.log("\n  labour now reads as:")
used.forEach((r) => console.log(`    ${String(r.activity_code).padEnd(10)} ${String(r.name ?? "?").padEnd(30)} ${r.n} rows  Rs ${Number(r.c).toLocaleString("en-IN")}`))
