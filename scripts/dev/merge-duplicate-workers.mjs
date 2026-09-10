#!/usr/bin/env node
/**
 * Merge duplicate roster rows: move every reference onto a survivor, then delete the loser.
 *
 * DRY RUN BY DEFAULT. Pass --commit to write. Pass --prod to target production.
 *
 * Identity cannot be inferred from the data at Medappa -- phones and bank accounts are shared
 * between different people (one account covers five workers), and device_user_code is empty for
 * all 58. So every pair here is supplied BY NAME, from a human who knows the estate. Nothing in
 * this script guesses.
 */
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const COMMIT = process.argv.includes("--commit")
const PROD = process.argv.includes("--prod")
const envValue = (name) => {
  if (process.env[name]) return process.env[name]
  for (const f of PROD ? [".env.vercel.production"] : [".env.local", ".env"]) {
    try { const m = readFileSync(f, "utf8").match(new RegExp(`^${name}=(.*)$`, "m")); if (m) return m[1].trim().replace(/^["']|["']$/g, "") } catch {}
  }
  return null
}
const sql = neon(envValue(PROD ? "DATABASE_URL" : "DATABASE_URL_DEV"))
const TENANT = "6542e164-f2b0-44e7-8cf8-0b6718270158"

/** Confirmed by the estate: same person, entered twice under two spellings. */
const MERGE_BY_NAME = [
  { keep: "SHAHAJUDDIN", drop: "SAHAJUDDIN" },
  { keep: "ISMAIL ALI SHADE", drop: "ISLAM ALI SHADE" },
]

/** Tables that point at a worker. Named explicitly so a new one cannot be silently missed. */
const REFERENCES = ["labour_assignments", "attendance_records", "picking_records", "worker_ledger", "worker_pay_rules"]

const findByName = async (name) => sql`
  SELECT id, full_name, active, created_at::date::text AS created
  FROM attendance_workers WHERE tenant_id = ${TENANT} AND upper(trim(full_name)) = ${name.toUpperCase()}`

const countRefs = async (id) => {
  const out = {}
  for (const t of REFERENCES) {
    // sql.query for a dynamic table name — the tagged form cannot interpolate an identifier.
    const r = await sql.query(`SELECT COUNT(*)::int c FROM ${t} WHERE tenant_id = $1 AND worker_id = $2`, [TENANT, id])
    out[t] = r[0].c
  }
  return out
}

console.log(`\n${COMMIT ? "COMMIT" : "DRY RUN"} — ${PROD ? "PRODUCTION" : "dev"}\n`)

for (const { keep, drop } of MERGE_BY_NAME) {
  const keepRows = await findByName(keep)
  const dropRows = await findByName(drop)
  if (keepRows.length !== 1 || dropRows.length !== 1) {
    console.log(`SKIP ${drop} -> ${keep}: expected one row each, found ${keepRows.length}/${dropRows.length}`)
    continue
  }
  const [k] = keepRows, [d] = dropRows
  const refs = await countRefs(d.id)
  const total = Object.values(refs).reduce((a, b) => a + b, 0)
  console.log(`${d.full_name} (${String(d.id).slice(0, 8)}) -> ${k.full_name} (${String(k.id).slice(0, 8)})`)
  console.log(`   moves: ${Object.entries(refs).filter(([, c]) => c).map(([t, c]) => `${t}=${c}`).join(", ") || "nothing"}  (${total} rows)`)
  if (!COMMIT) continue
  for (const t of REFERENCES) {
    if (!refs[t]) continue
    await sql.query(`UPDATE ${t} SET worker_id = $1 WHERE tenant_id = $2 AND worker_id = $3`, [k.id, TENANT, d.id])
  }
  await sql`DELETE FROM attendance_workers WHERE id = ${d.id}::uuid AND tenant_id = ${TENANT}`
  console.log(`   done`)
}

console.log("\nEmpty duplicate rows (zero references anywhere) — safe to remove either way:")
const empties = await sql`
  WITH d AS (SELECT upper(trim(full_name)) nm FROM attendance_workers WHERE tenant_id=${TENANT} GROUP BY 1 HAVING COUNT(*)>1)
  SELECT w.id, w.full_name, w.created_at::date::text created FROM attendance_workers w
  WHERE w.tenant_id=${TENANT} AND upper(trim(w.full_name)) IN (SELECT nm FROM d)
    AND NOT EXISTS (SELECT 1 FROM labour_assignments x WHERE x.worker_id=w.id)
    AND NOT EXISTS (SELECT 1 FROM attendance_records x WHERE x.worker_id=w.id)
    AND NOT EXISTS (SELECT 1 FROM picking_records x WHERE x.worker_id=w.id)
    AND NOT EXISTS (SELECT 1 FROM worker_ledger x WHERE x.worker_id=w.id)
    AND NOT EXISTS (SELECT 1 FROM worker_pay_rules x WHERE x.worker_id=w.id)
  ORDER BY w.full_name`
for (const e of empties) console.log(`   ${String(e.id).slice(0,8)}  ${e.full_name}  (created ${e.created})`)
if (COMMIT && empties.length) {
  for (const e of empties) await sql`DELETE FROM attendance_workers WHERE id = ${e.id}::uuid AND tenant_id = ${TENANT}`
  console.log(`   removed ${empties.length}`)
}
console.log(COMMIT ? "\nWritten.\n" : "\nNothing written. Re-run with --commit to apply.\n")
