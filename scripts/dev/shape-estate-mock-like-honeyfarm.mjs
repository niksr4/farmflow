/**
 * Give Estate Mock HoneyFarm's shape, so the biometric and muster testing happens against the
 * arrangement it will actually meet.
 *
 * Run: node --env-file=.env.local scripts/dev/shape-estate-mock-like-honeyfarm.mjs [--commit]
 *      node scripts/dev/shape-estate-mock-like-honeyfarm.mjs prod --commit   (DATABASE_URL exported)
 *
 * HoneyFarm is two estates -- Honeyfarm (HF A/C, HF B) and Sidapur (MV, PG) -- sharing one
 * storehouse, with almost every cost sitting on an estate-general location rather than a block.
 * Estate Mock already carries HoneyFarm's *old* three-estate naming with no estates set at all,
 * which is the one shape nobody has any more.
 *
 * WHY THE BARE "HF" BECOMES THE GENERAL BLOCK. It holds this tenant's processing, dispatch, sales,
 * labour and expense rows -- exactly the position HoneyFarm's own bare HF was in before
 * scripts/130 renamed it. Mirroring that is the point: it reproduces the case where a per-block
 * cost report is nearly empty because the money is on something that is not a block.
 *
 * The code stays 'HF' on purpose. scripts/dev/estate-mock-a-day.mjs resolves blocks by code, so
 * keeping it means the day-simulator still runs. Only the display name changes, exactly as it did
 * at HoneyFarm.
 *
 * This does NOT touch workers, attendance or punches. seed-estate-mock.mjs deletes all three, and
 * running that would destroy the four biometric attendance records that are currently the only
 * evidence the scanner relay works end to end.
 */
import { neon } from "@neondatabase/serverless"

const isProd = process.argv.includes("prod")
const commit = process.argv.includes("--commit")
const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)

const rows = await sql`SELECT id FROM tenants WHERE name = 'Estate Mock'`
if (!rows.length) {
  console.error(`No Estate Mock on ${isProd ? "PROD" : "dev"}.`)
  process.exit(1)
}
const T = rows[0].id
console.log(`\n=== ${isProd ? "PRODUCTION" : "dev"} — Estate Mock -> HoneyFarm's shape ===\n`)

const before = await sql`SELECT name, code, estate, kind FROM locations WHERE tenant_id = ${T} ORDER BY kind, name`
console.log("before:")
for (const b of before) console.log(`  ${String(b.estate ?? "—").padEnd(12)} ${b.kind.padEnd(8)} ${b.name}  [${b.code}]`)

if (!commit) {
  console.log("\nDry run. Re-run with --commit to write.")
  process.exit(0)
}

// The bare HF holds the records, so it becomes the estate-general location -- same move as 130.
await sql`UPDATE locations SET name = 'Honeyfarm (general)', kind = 'general', estate = 'Honeyfarm', area_acres = NULL
          WHERE tenant_id = ${T} AND code = 'HF'`

await sql`UPDATE locations SET estate = 'Sidapur', kind = 'block' WHERE tenant_id = ${T} AND code IN ('MV', 'PG')`

// The two real Honeyfarm blocks, and Sidapur's general. Idempotent on code.
for (const [name, code, estate, kind] of [
  ["HF A/C", "HF-AC", "Honeyfarm", "block"],
  ["HF B", "HF-B", "Honeyfarm", "block"],
  ["Sidapur (general)", "SIDAPUR-GEN", "Sidapur", "general"],
]) {
  await sql`INSERT INTO locations (tenant_id, name, code, estate, kind)
            VALUES (${T}, ${name}, ${code}, ${estate}, ${kind})
            ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, estate = EXCLUDED.estate, kind = EXCLUDED.kind`
}

// One shed for both estates, which is what HoneyFarm runs. NULL estate = serves every estate.
await sql`UPDATE locations SET estate = NULL WHERE tenant_id = ${T} AND kind = 'store'`

// Harness litter from earlier UI runs. Unreferenced, so the FKs added in scripts/134 permit it.
const junk = await sql`DELETE FROM locations WHERE tenant_id = ${T} AND name LIKE 'UI Test Block %' RETURNING name`
console.log(`\nremoved ${junk.length} leftover UI test block(s)`)

const after = await sql`SELECT name, code, estate, kind FROM locations WHERE tenant_id = ${T} ORDER BY estate NULLS LAST, kind, name`
console.log("\nafter:")
for (const b of after) console.log(`  ${String(b.estate ?? "—").padEnd(12)} ${b.kind.padEnd(8)} ${b.name}  [${b.code}]`)

const kept = await sql`SELECT
  (SELECT COUNT(*) FROM attendance_workers WHERE tenant_id = ${T})::int workers,
  (SELECT COUNT(*) FROM attendance_records WHERE tenant_id = ${T})::int attendance,
  (SELECT COUNT(*) FROM biometric_punches  WHERE tenant_id = ${T})::int punches`
console.log(`\nuntouched: ${kept[0].workers} workers, ${kept[0].attendance} attendance rows, ${kept[0].punches} punches`)
