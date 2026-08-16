/**
 * Proves labour_cost reports exactly what labor_transactions did, for every tenant.
 *
 *   node --env-file=.env.local scripts/dev/labour-parity.mjs            # dev
 *   DATABASE_URL=... node scripts/dev/labour-parity.mjs --prod          # prod, read-only
 *
 * Run this before applying 114-117 anywhere real. Every reader in the app now goes through the
 * view, so if the view disagrees with the table by a rupee on any tenant, the deploy silently
 * changes numbers that customers have already seen.
 *
 * Totals alone are not enough: a swapped estate/contract pair, or an activity code mapped to the
 * wrong column, preserves the grand total while scrambling every breakdown built on it. So this
 * compares the groupings the UI actually draws -- by block, by code, and the estate/contract
 * split -- row by row.
 *
 * A tenant with a cutover date is expected to differ and is reported, not failed: that is the
 * feature working.
 */

import { neon } from "@neondatabase/serverless"

const isProd = process.argv.includes("--prod")
const url = isProd ? process.env.DATABASE_URL : (process.env.DATABASE_URL_DEV || process.env.DATABASE_URL)
if (!url) {
  console.error(isProd ? "Set DATABASE_URL for --prod" : "Set DATABASE_URL_DEV")
  process.exit(2)
}
const sql = neon(url)

let failures = 0
const money = (n) => "Rs " + Number(n).toLocaleString("en-IN")

const tenants = await sql`SELECT id, name FROM tenants ORDER BY name`
console.log(`\n${isProd ? "PRODUCTION" : "dev"}: ${tenants.length} tenants\n`)

for (const t of tenants) {
  const cutover = await sql`SELECT assignments_from::text d FROM tenant_labour_entry_mode WHERE tenant_id=${t.id}`
  if (cutover.length > 0) {
    console.log(`  --   ${t.name}: switched to the muster from ${cutover[0].d}; a difference here is the point`)
    continue
  }

  // Grand total and row count.
  const [a] = await sql`
    SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
    FROM labor_transactions WHERE tenant_id=${t.id}`
  const [b] = await sql`
    SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
    FROM labour_cost WHERE tenant_id=${t.id}`

  // Every grouping the UI draws off this data.
  const grouping = async (relation, dateCol, codeCol, estateCol, rateCol, contractCol, contractRateCol) => {
    const rows = await sql.query(
      `SELECT COALESCE(${codeCol},'-') AS k,
              COALESCE(location_id::text,'-') AS loc,
              SUM(total_cost)::numeric AS cost,
              SUM(${estateCol})::numeric AS est,
              SUM(${estateCol} * ${rateCol})::numeric AS est_cost,
              SUM(${contractCol})::numeric AS con,
              SUM(${contractCol} * ${contractRateCol})::numeric AS con_cost,
              MIN(${dateCol})::text AS first_day
       FROM ${relation} WHERE tenant_id = $1
       GROUP BY 1,2 ORDER BY 1,2`,
      [t.id],
    )
    return rows.map((r) => JSON.stringify(r)).join("\n")
  }

  const legacy = await grouping(
    "labor_transactions", "deployment_date", "code",
    "COALESCE(hf_laborers,0)", "COALESCE(hf_cost_per_laborer,0)",
    "COALESCE(outside_laborers,0)", "COALESCE(outside_cost_per_laborer,0)",
  )
  const view = await grouping(
    "labour_cost", "work_date", "activity_code",
    "estate_laborers", "estate_rate", "contract_laborers", "contract_rate",
  )

  const totalsMatch = a.n === b.n && Math.abs(Number(a.c) - Number(b.c)) < 0.005
  const groupsMatch = legacy === view
  const ok = totalsMatch && groupsMatch
  if (!ok) failures++

  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${t.name.padEnd(18)} ${String(a.n).padStart(5)} rows / ${money(a.c).padStart(16)}` +
    (totalsMatch ? "" : `  <- view says ${b.n} rows / ${money(b.c)}`) +
    (groupsMatch ? "" : "  <- breakdowns differ"),
  )
  if (!groupsMatch) {
    const l = legacy.split("\n"), v = view.split("\n")
    for (let i = 0; i < Math.max(l.length, v.length); i++) {
      if (l[i] !== v[i]) { console.log(`         table: ${l[i] ?? "(none)"}\n         view : ${v[i] ?? "(none)"}`); break }
    }
  }
}

console.log(failures === 0 ? "\nPARITY OK -- the view reports exactly what the table did\n" : `\n${failures} TENANT(S) DIFFER\n`)
process.exit(failures === 0 ? 0 : 1)
