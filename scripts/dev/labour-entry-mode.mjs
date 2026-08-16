/**
 * Switch a tenant from typing labour into Accounts to allocating it on the muster roll.
 *
 *   node --env-file=.env.local scripts/dev/labour-entry-mode.mjs                        # show everyone
 *   node --env-file=.env.local scripts/dev/labour-entry-mode.mjs "Medappa" 2026-09-01   # set
 *   node --env-file=.env.local scripts/dev/labour-entry-mode.mjs "Medappa" --off        # undo
 *   DATABASE_URL=... node scripts/dev/labour-entry-mode.mjs "Medappa" 2026-09-01 --prod
 *
 * One row is the whole switch. From the given date labour_cost stops reading that tenant's
 * labor_transactions and starts reading their labour_assignments, and every reader in the app
 * follows because they all go through the view. Before the date nothing changes, so history stays
 * exactly as it was reported at the time.
 *
 * Reversible: --off deletes the row and the tenant's numbers go back to the legacy table. The
 * assignments are not deleted, they just stop being counted.
 *
 * Pick a date that has not happened yet, or the first of a month. Backdating over days that
 * already have Accounts entries hides them and counts whatever is on the muster instead, which
 * for most days is nothing -- that is a silent under-report, the one failure this design exists
 * to avoid.
 */

import { neon } from "@neondatabase/serverless"

const args = process.argv.slice(2).filter((a) => a !== "--prod")
const isProd = process.argv.includes("--prod")
const url = isProd ? process.env.DATABASE_URL : (process.env.DATABASE_URL_DEV || process.env.DATABASE_URL)
if (!url) { console.error(isProd ? "Set DATABASE_URL for --prod" : "Set DATABASE_URL_DEV"); process.exit(2) }
const sql = neon(url)

const show = async () => {
  const rows = await sql`
    SELECT t.name,
           m.assignments_from::text AS from_date,
           (SELECT COUNT(*)::int FROM labour_assignments a WHERE a.tenant_id = t.id) AS assignments,
           (SELECT COUNT(*)::int FROM labor_transactions l WHERE l.tenant_id = t.id) AS legacy
    FROM tenants t
    LEFT JOIN tenant_labour_entry_mode m ON m.tenant_id = t.id
    ORDER BY t.name`
  console.log(`\n${isProd ? "PRODUCTION" : "dev"}\n`)
  console.log("  tenant             entry mode                    muster  accounts")
  for (const r of rows) {
    const mode = r.from_date ? `muster from ${r.from_date}` : "Accounts (unchanged)"
    console.log(`  ${r.name.padEnd(18)} ${mode.padEnd(28)} ${String(r.assignments).padStart(6)} ${String(r.legacy).padStart(9)}`)
  }
  console.log()
}

if (args.length === 0) { await show(); process.exit(0) }

const [needle, when] = args
const matches = await sql`SELECT id, name FROM tenants WHERE name ILIKE ${"%" + needle + "%"}`
if (matches.length !== 1) {
  console.error(matches.length === 0 ? `No tenant matching "${needle}"` : `"${needle}" matches ${matches.map((m) => m.name).join(", ")} -- be more specific`)
  process.exit(2)
}
const tenant = matches[0]

if (when === "--off") {
  await sql`DELETE FROM tenant_labour_entry_mode WHERE tenant_id=${tenant.id}`
  console.log(`\n${tenant.name}: back to Accounts. Their muster allocations are kept but no longer counted.\n`)
  await show()
  process.exit(0)
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(when || "")) {
  console.error("Give a date as YYYY-MM-DD, or --off")
  process.exit(2)
}

// Refuse to hide days a tenant has already reported on. Backdating past existing Accounts entries
// is the one move that silently lowers a number somebody has seen.
const [clash] = await sql`
  SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
  FROM labor_transactions WHERE tenant_id=${tenant.id} AND deployment_date >= ${when}::date`
if (clash.n > 0) {
  console.error(
    `\nRefusing: ${tenant.name} has ${clash.n} Accounts labour ${clash.n === 1 ? "entry" : "entries"} ` +
    `on or after ${when}, worth Rs ${Number(clash.c).toLocaleString("en-IN")}.\n` +
    `Switching from that date would stop counting them. Pick a later date, or move those entries ` +
    `onto the muster first.\n`,
  )
  process.exit(1)
}

await sql`
  INSERT INTO tenant_labour_entry_mode (tenant_id, assignments_from)
  VALUES (${tenant.id}, ${when}::date)
  ON CONFLICT (tenant_id) DO UPDATE SET assignments_from = EXCLUDED.assignments_from`

console.log(`\n${tenant.name}: labour comes from the muster roll from ${when}. Everything before is untouched.\n`)
await show()
