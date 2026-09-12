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
 *
 * ALL OR NOTHING. Every write runs inside ONE transaction, and it is built after all the reading
 * is done.
 *
 * The first version issued each UPDATE separately. Over the neon HTTP driver every statement
 * autocommits, so a failure partway left production split between the survivor and the loser with
 * no way back -- and there is a specific, likely failure: attendance_records is unique on
 * (tenant_id, worker_id, attendance_date), so if both rows have attendance on the SAME DAY the
 * UPDATE collides. By then labour_assignments has already moved. The roster would be worse than
 * before it ran, on production, on a script whose whole purpose is to tidy the roster.
 *
 * Raised by Greptile, 2026-09-11, before the script had been run with --commit anywhere.
 *
 * A same-day collision is still a failure -- this does not merge the two days into one, because
 * which of two attendance rows is the truth is not a question a script may answer. It now fails
 * cleanly and changes nothing, which is the correct outcome for a question that needs a human.
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

/** Set when a merge cannot proceed safely; nothing is written if any is. */
let blocked = false

/** Every statement the run will make, built while reading and executed together at the end. */
const planned = []

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
  // A same-day clash would fail the UPDATE below and roll the whole run back. Better to say so
  // here, while it is still a dry run, than to discover it mid-commit.
  const clash = await sql`
    SELECT attendance_date::text AS d FROM attendance_records
    WHERE tenant_id = ${TENANT} AND worker_id = ${k.id}::uuid
      AND attendance_date IN (
        SELECT attendance_date FROM attendance_records
        WHERE tenant_id = ${TENANT} AND worker_id = ${d.id}::uuid
      )
    ORDER BY 1`
  if (clash.length) {
    console.log(`   ⚠ BOTH have attendance on ${clash.length} day(s): ${clash.map((c) => c.d).join(", ")}`)
    console.log(`     Merging would collide on the one-row-per-worker-per-day index. Resolve by hand first.`)
    blocked = true
    continue
  }
  if (!COMMIT) continue
  for (const t of REFERENCES) {
    if (!refs[t]) continue
    // Not awaited: the neon driver collects un-awaited queries and transaction() runs them as one.
    planned.push(sql.query(`UPDATE ${t} SET worker_id = $1 WHERE tenant_id = $2 AND worker_id = $3`, [k.id, TENANT, d.id]))
  }
  planned.push(sql`DELETE FROM attendance_workers WHERE id = ${d.id}::uuid AND tenant_id = ${TENANT}`)
  console.log(`   queued`)
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
  for (const e of empties) planned.push(sql`DELETE FROM attendance_workers WHERE id = ${e.id}::uuid AND tenant_id = ${TENANT}`)
}

if (blocked) {
  console.log("\nNothing written — at least one merge is blocked above. Resolve it and re-run.\n")
  process.exit(1)
}

if (COMMIT && planned.length) {
  // One transaction for the whole run. Either the roster ends up merged, or it is untouched.
  await sql.transaction(planned)
  console.log(`\nWritten — ${planned.length} statement(s) in one transaction.\n`)
} else {
  console.log(COMMIT ? "\nNothing to write.\n" : "\nNothing written. Re-run with --commit to apply.\n")
}
