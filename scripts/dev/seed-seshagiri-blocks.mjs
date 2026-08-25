/**
 * Give Seshagiri their real block map, with acreage.
 *
 * Run: node --env-file=.env.local scripts/dev/seed-seshagiri-blocks.mjs [prod]           (dry run)
 *      node --env-file=.env.local scripts/dev/seed-seshagiri-blocks.mjs [prod] --commit
 *
 * From the owner's list of 25 Aug 2026: 20 units, 94.1 acres, all one estate.
 *
 * WHAT WAS THERE BEFORE. Six placeholders -- "Seshagiri" and "Seshagiri A" through "E" -- with no
 * acreage, created when the account was set up and never used by anything: their five labour rows
 * all carry no location and their stock sits in the store. Nothing references them, so they are
 * removed rather than reconciled. Guessing that "Seshagiri A" meant "Arabica A" would have been
 * inventing a mapping the owner never made, and it would have been unpickable later.
 *
 * FIRST TENANT WITH REAL ACREAGE. All 36 blocks across every estate currently have none, which is
 * why no per-acre figure exists anywhere in the product. This is the denominator arriving.
 *
 * ARECANUT AND THE PADDY FIELD ARE INCLUDED, as blocks, because they are land the estate spends
 * money on and excluding them would misstate cost per acre for everything else -- the spend would
 * still land somewhere. They are not coffee, so any yield-per-acre reading must be taken per block
 * rather than estate-wide, which is true of the young plantings too.
 *
 * "RP" IS REPLANTING, kept as its own block rather than folded into its parent. A replanted patch
 * costs differently and yields differently from mature coffee beside it, and averaging the two
 * hides exactly the thing an estate replants to find out.
 */
import { neon } from "@neondatabase/serverless"

const isProd = process.argv.includes("prod")
const commit = process.argv.includes("--commit")
const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)

const ESTATE = "Seshagiri"

/** [name, code, acres] exactly as the owner listed them. */
const BLOCKS = [
  ["Arabica A", "SG-AR-A", 2.5],
  ["Arabica B", "SG-AR-B", 2.0],
  ["Arabica C", "SG-AR-C", 5.7],
  ["Arabica D", "SG-AR-D", 3.0],
  ["Arabica E", "SG-AR-E", 4.5],
  ["Arabica F", "SG-AR-F", 3.5],
  ["Robusta I", "SG-RB-1", 14.0],
  ["Robusta II", "SG-RB-2", 11.0],
  ["Robusta III", "SG-RB-3", 5.5],
  ["Robusta III RP", "SG-RB-3-RP", 4.5],
  ["Robusta IV", "SG-RB-4", 8.0],
  ["Robusta V", "SG-RB-5", 5.0],
  ["Paddy Field", "SG-PADDY", 2.0],
  ["F-RP", "SG-F-RP", 5.0],
  ["I-A", "SG-I-A", 2.4],
  ["I-B", "SG-I-B", 3.3],
  ["A-RP", "SG-A-RP", 2.5],
  ["B-RP", "SG-B-RP", 1.7],
  ["D-RP", "SG-D-RP", 3.0],
  ["Arecanut", "SG-ARECA", 5.0],
]

const [tenant] = await sql`SELECT id, name FROM tenants WHERE name = 'Seshagiri'`
if (!tenant) {
  console.error(`No Seshagiri tenant on ${isProd ? "PROD" : "dev"}.`)
  process.exit(1)
}

const existing = await sql`
  SELECT id, name, code, kind, estate, area_acres FROM locations WHERE tenant_id = ${tenant.id} ORDER BY kind, name`

/**
 * Only remove a placeholder nothing points at. The check is per-table rather than a blanket
 * assumption, because "we think it is unused" is how a location with history gets deleted and its
 * records orphaned -- scripts/134 added FKs precisely to make that fail loudly instead.
 */
const usage = async (id) => {
  const [u] = await sql`SELECT
    (SELECT COUNT(*) FROM labor_transactions   WHERE location_id = ${id})::int labour,
    (SELECT COUNT(*) FROM expense_transactions WHERE location_id = ${id})::int expense,
    (SELECT COUNT(*) FROM current_inventory    WHERE location_id = ${id})::int stock,
    (SELECT COUNT(*) FROM transaction_history  WHERE location_id = ${id})::int ledger,
    (SELECT COUNT(*) FROM processing_records   WHERE location_id = ${id})::int processing,
    (SELECT COUNT(*) FROM labour_assignments   WHERE location_id = ${id})::int muster,
    (SELECT COUNT(*) FROM attendance_workers   WHERE location_id = ${id})::int workers`
  return u
}

const total = BLOCKS.reduce((s, [, , a]) => s + a, 0)
console.log(`\n=== ${isProd ? "PRODUCTION" : "dev"} — Seshagiri blocks ===\n`)
console.log(`  to create : ${BLOCKS.length} blocks, ${total.toFixed(1)} acres, estate "${ESTATE}"`)
console.log(`  currently : ${existing.length} location(s)\n`)

const placeholders = existing.filter((l) => l.kind === "block")
const removable = []
for (const l of placeholders) {
  const u = await usage(l.id)
  const used = Object.values(u).reduce((a, b) => a + b, 0)
  console.log(`    ${l.name.padEnd(16)} ${used === 0 ? "unused — will be removed" : `IN USE (${JSON.stringify(u)}) — will be kept`}`)
  if (used === 0) removable.push(l)
}

if (!commit) {
  console.log("\nDry run. Re-run with --commit to write.\n")
  process.exit(0)
}

let created = 0
for (const [name, code, acres] of BLOCKS) {
  await sql`
    INSERT INTO locations (tenant_id, name, code, estate, kind, area_acres)
    VALUES (${tenant.id}, ${name}, ${code}, ${ESTATE}, 'block', ${acres})
    ON CONFLICT (tenant_id, code) DO UPDATE
      SET name = EXCLUDED.name, estate = EXCLUDED.estate, area_acres = EXCLUDED.area_acres`
  created += 1
}

// The store had no estate. With one named estate it should serve it -- a NULL estate serves every
// estate, which is the same thing here and less clear to read.
await sql`UPDATE locations SET estate = ${ESTATE} WHERE tenant_id = ${tenant.id} AND kind = 'store'`

let removed = 0
for (const l of removable) {
  await sql`DELETE FROM locations WHERE id = ${l.id} AND tenant_id = ${tenant.id}`
  removed += 1
}

// Every named estate gets somewhere to put a cost that belongs to no block (scripts/138).
await sql`
  INSERT INTO locations (tenant_id, name, code, estate, kind, area_acres)
  VALUES (${tenant.id}, ${ESTATE + " (general)"}, 'SESHAGIRI-GEN', ${ESTATE}, 'general', NULL)
  ON CONFLICT (tenant_id, code) DO NOTHING`

const after = await sql`
  SELECT kind, COUNT(*)::int n, COALESCE(SUM(area_acres), 0)::numeric acres
  FROM locations WHERE tenant_id = ${tenant.id} GROUP BY kind ORDER BY kind`
console.log(`\nWRITTEN. ${created} block(s) written, ${removed} placeholder(s) removed.\n`)
for (const r of after) console.log(`  ${r.kind.padEnd(9)} ${r.n}${Number(r.acres) ? `, ${Number(r.acres)} acres` : ""}`)
console.log(`\n  Seshagiri is the first tenant with real acreage. Cost and yield per acre now have a`)
console.log(`  denominator for these 20 blocks; the other 36 across three tenants still do not.\n`)
