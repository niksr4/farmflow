/**
 * Switch one tenant from typed-aggregate labour to the muster roll, on a chosen date.
 *
 * Run: node scripts/dev/cutover-tenant-to-muster.mjs "<tenant name>" <YYYY-MM-DD> [prod]
 *      (prod needs DATABASE_URL exported from .env.vercel.production)
 *      Add --commit to actually write; without it this only reports what would happen.
 *
 * WHY THE DATE MATTERS MORE THAN IT LOOKS. labour_cost reads labor_transactions for dates
 * *before* assignments_from and labour_assignments for dates *on or after* it, never both.
 * That is what stops a day being counted twice -- and it is also why a cutover date landing on
 * a day that already has a typed labour row silently removes that row's cost from Accounts, the
 * P&L and every digest, with no muster row to replace it. Medappa had exactly that: a Rs 18,200
 * row dated the day we were about to cut over.
 *
 * So this refuses a date that would orphan spend, and prints what each side of the line holds
 * before writing anything.
 */
import { neon } from "@neondatabase/serverless"

const [nameArg, dateArg] = process.argv.slice(2)
const isProd = process.argv.includes("prod")
const commit = process.argv.includes("--commit")

if (!nameArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg || "")) {
  console.error('usage: cutover-tenant-to-muster.mjs "<tenant name>" <YYYY-MM-DD> [prod] [--commit]')
  process.exit(2)
}

const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)
const money = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN")

const tenants = await sql`SELECT id, name FROM tenants WHERE name = ${nameArg}`
if (!tenants.length) {
  console.error(`No tenant named "${nameArg}" on ${isProd ? "PROD" : "DEV"}.`)
  process.exit(1)
}
const { id: tenantId, name } = tenants[0]

console.log(`\n=== ${isProd ? "PRODUCTION" : "DEV"} — ${name} → muster from ${dateArg} ===\n`)

const existing = await sql`SELECT assignments_from::text d, set_by FROM tenant_labour_entry_mode WHERE tenant_id=${tenantId}`
if (existing.length) {
  console.log(`Already on the muster from ${existing[0].d.slice(0, 10)} (set by ${existing[0].set_by || "unknown"}).`)
  console.log("Re-running would move the line and change which side existing records fall on. Nothing written.\n")
  process.exit(0)
}

// What stays on the legacy side of the line.
const before = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c,
                                MIN(deployment_date)::text mn, MAX(deployment_date)::text mx
                         FROM labor_transactions
                         WHERE tenant_id=${tenantId} AND deployment_date < ${dateArg}::date`
// What would be silently dropped: typed rows on or after the line, with nothing to replace them.
const orphaned = await sql`SELECT deployment_date::text d, COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
                           FROM labor_transactions
                           WHERE tenant_id=${tenantId} AND deployment_date >= ${dateArg}::date
                           GROUP BY deployment_date ORDER BY deployment_date`

console.log(`legacy rows kept   (before ${dateArg}): ${before[0].n} rows, ${money(before[0].c)}` +
  (before[0].mn ? `  [${before[0].mn.slice(0, 10)} .. ${before[0].mx.slice(0, 10)}]` : ""))

if (orphaned.length) {
  const total = orphaned.reduce((s, r) => s + Number(r.c), 0)
  console.log(`\n*** REFUSING: ${orphaned.length} typed labour day(s) on or after ${dateArg}, ${money(total)} ***`)
  for (const r of orphaned) console.log(`      ${r.d.slice(0, 10)}  ${r.n} row(s)  ${money(r.c)}`)
  console.log(`\n  These would drop out of Accounts, the P&L and the digests the moment the cutover lands,`)
  console.log(`  because labour_cost stops reading typed rows from ${dateArg} and there is no muster row yet.`)
  console.log(`  Either pick a later date, or have the estate re-enter these days on the muster first.\n`)
  process.exit(1)
}

// Readiness: allocation is refused for a worker with no wage and no typed amount.
const workers = await sql`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE daily_rate IS NULL)::int no_rate
                          FROM attendance_workers WHERE tenant_id=${tenantId} AND active`
console.log(`\nroster: ${workers[0].total} active workers, ${workers[0].no_rate} with no daily wage`)
if (workers[0].no_rate > 0) {
  console.log(`  NOTE: those ${workers[0].no_rate} cannot be allocated until a wage is set on the Workers tab,`)
  console.log(`        or an amount is typed on the deployment itself. Not fatal -- the cutover is a date,`)
  console.log(`        not a migration -- but it is what they will hit first.`)
}

if (!commit) {
  console.log(`\nDry run. Re-run with --commit to write.\n`)
  process.exit(0)
}

await sql`INSERT INTO tenant_labour_entry_mode (tenant_id, assignments_from, set_by)
          VALUES (${tenantId}, ${dateArg}::date, 'cutover-tenant-to-muster.mjs')`

const check = await sql`SELECT assignments_from::text d FROM tenant_labour_entry_mode WHERE tenant_id=${tenantId}`
const after = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c FROM labour_cost WHERE tenant_id=${tenantId}`
console.log(`\nWRITTEN. ${name} reads the muster from ${check[0].d.slice(0, 10)}.`)
console.log(`labour_cost now reports ${after[0].n} rows, ${money(after[0].c)} — unchanged from before, since the line is in the future.\n`)
