#!/usr/bin/env node
// Regression test for tenant isolation via row-level security.
//
// Proves that once the application connects as a least-privilege, NON-BYPASSRLS role
// (the C-1 hardening), RLS confines every query to the tenant named in the app.tenant_id
// GUC — even a query that explicitly asks for another tenant's rows returns nothing.
//
// It does this without needing a second set of credentials: as the owner it creates a
// throwaway non-bypass role, SET ROLEs into it, and asserts isolation, then drops the role.
// Requires two tenants that own data. Exits non-zero on any leak.
//
//   node scripts/check-tenant-isolation.mjs          # dev  (DATABASE_URL_DEV)
//   node scripts/check-tenant-isolation.mjs --prod   # prod (DATABASE_URL)
//
// EVERY tenant_id table is checked, discovered from the catalogue -- not a hand-written list.
//
// Until 2026-09-08 this held a fixed array of five table names, tested THE FIRST ONE that happened
// to have rows, and then printed "Tenant isolation holds". In practice that meant it had only ever
// proved sales_records, because sales_records was first and always had data. Every table added
// since -- worker_ledger, labour_assignments, attendance_workers, picking_records, and now
// worker_pay_rules, which is about to hold what each person is paid -- was covered by the claim and
// not by the test.
//
// Its sibling scripts/check-rls-coverage.mjs discovers tables by column and has always been right
// about scope. A prover that enumerates while the checker beside it discovers is the weaker of the
// two making the louder claim. This now discovers too, tests every table that has data to test
// with, and reports what it could NOT prove instead of quietly passing.

import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const useProd = process.argv.includes("--prod")

function loadEnvValue(name) {
  if (process.env[name]) return process.env[name]
  for (const file of [".env.local", ".env", ".env.vercel.production"]) {
    try {
      const line = readFileSync(file, "utf8").split("\n").find((l) => l.startsWith(`${name}=`))
      if (line) return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "")
    } catch {
      /* try next */
    }
  }
  return null
}

const connectionString = useProd ? loadEnvValue("DATABASE_URL") : loadEnvValue("DATABASE_URL_DEV") || loadEnvValue("DATABASE_URL")
if (!connectionString) {
  console.error(`✗ No ${useProd ? "DATABASE_URL" : "DATABASE_URL_DEV"} found.`)
  process.exit(2)
}

const sql = neon(connectionString)

/** Postgres identifiers, so a catalogue name can be inlined into a DO block (which takes no binds). */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function main() {
  const tenants = await sql`SELECT id FROM tenants ORDER BY id`
  if (tenants.length < 2) {
    console.log(`⚠ Only ${tenants.length} tenant(s) present — need 2 to test isolation. Skipping (not a failure).`)
    process.exit(0)
  }

  // Every base table carrying a tenant_id, from the catalogue. Same discovery rule as
  // check-rls-coverage.mjs, so a table added tomorrow is covered without anyone remembering.
  const discovered = await sql`
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  `
  const tables = discovered.map((r) => String(r.table_name)).filter((t) => IDENTIFIER.test(t))

  // A table with no rows anywhere proves nothing either way -- reading zero rows of a table that
  // has zero rows is not isolation. Those are REPORTED rather than counted as passes.
  const scenarios = []
  const unprovable = []
  for (const table of tables) {
    const counts = await sql.query(
      `SELECT tenant_id, COUNT(*)::int AS c FROM ${table} GROUP BY tenant_id HAVING COUNT(*) > 0 ORDER BY c DESC LIMIT 1`,
    )
    const rows = Array.isArray(counts) ? counts : counts?.rows ?? []
    const tenantB = rows[0]?.tenant_id
    const tenantA = tenantB ? tenants.find((t) => t.id !== tenantB)?.id : null
    if (tenantB && tenantA && UUID.test(String(tenantA)) && UUID.test(String(tenantB))) {
      scenarios.push({ table, tenantA, tenantB, rows: rows[0].c })
    } else {
      unprovable.push(table)
    }
  }

  if (scenarios.length === 0) {
    console.log("⚠ No tenant-scoped rows found to test against. Skipping (not a failure).")
    process.exit(0)
  }

  // One probe role for the whole run, and one round trip. Identifiers come from the catalogue and
  // are re-validated above; tenant ids are canonical UUIDs. A DO block body takes no bind params,
  // which is why both are checked rather than trusted.
  const probes = scenarios
    .map(
      ({ table, tenantA, tenantB }) => `
      PERFORM set_config('app.tenant_id', '${tenantA}', true);
      SELECT count(*) INTO leaked FROM ${table} WHERE tenant_id = '${tenantB}';
      IF leaked <> 0 THEN
        RESET ROLE;
        RAISE EXCEPTION 'ISOLATION LEAK: a tenant-A session read % rows of tenant B from ${table}', leaked;
      END IF;`,
    )
    .join("\n")

  const doBlock = `
    DO $$
    DECLARE leaked int;
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ff_isolation_probe') THEN DROP ROLE ff_isolation_probe; END IF;
      CREATE ROLE ff_isolation_probe NOLOGIN NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO ff_isolation_probe;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO ff_isolation_probe;
      EXECUTE format('GRANT ff_isolation_probe TO %I', current_user);

      SET LOCAL ROLE ff_isolation_probe;
      PERFORM set_config('app.role', 'admin', true);
${probes}
      RESET ROLE;

      EXECUTE format('REVOKE ff_isolation_probe FROM %I', current_user);
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ff_isolation_probe;
      REVOKE ALL ON SCHEMA public FROM ff_isolation_probe;
      DROP ROLE ff_isolation_probe;
    END $$;
  `

  console.log(`Probing ${scenarios.length} tenant table(s) with real data, as a non-bypass role.`)
  const result = await sql.query(doBlock).then(() => "ok").catch((e) => e)

  if (result !== "ok") {
    console.error("✗ FAIL:", result?.message || result)
    // The probe role is dropped inside the block; if the block aborted it may survive. Say so
    // rather than leaving a stray grantee nobody knows about.
    await sql`DROP ROLE IF EXISTS ff_isolation_probe`.catch(() => undefined)
    process.exit(1)
  }

  console.log(`✓ PASS — ${scenarios.length} of ${tables.length} tenant tables proved: a tenant-A session reads zero rows of tenant B.`)
  if (unprovable.length) {
    // Not a failure and not a pass. An empty table is covered by check-rls-coverage (which asserts
    // the policy exists) but cannot be *proved* here, and saying so is the difference between this
    // script and the one it replaced.
    console.log(`  ${unprovable.length} table(s) had no data to probe with, so isolation is asserted by policy only:`)
    console.log(`  ${unprovable.join(", ")}`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error("✗ Test error:", e?.message || e)
  process.exit(2)
})
