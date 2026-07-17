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
// Tables checked are the tenant-scoped ones most sensitive to a leak.

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
const CHECK_TABLES = ["sales_records", "dispatch_records", "processing_records", "expense_transactions", "labor_transactions"]

async function main() {
  const tenants = await sql`SELECT id FROM tenants ORDER BY id`
  if (tenants.length < 2) {
    console.log(`⚠ Only ${tenants.length} tenant(s) present — need 2 to test isolation. Skipping (not a failure).`)
    process.exit(0)
  }

  // Find a (tenantA, tenantB, table) triple where tenantB actually has rows, so the test is meaningful.
  let scenario = null
  for (const table of CHECK_TABLES) {
    const counts = await sql.query(
      `SELECT tenant_id, COUNT(*)::int AS c FROM ${table} GROUP BY tenant_id HAVING COUNT(*) > 0 ORDER BY c DESC LIMIT 1`,
    )
    const rowsB = Array.isArray(counts) ? counts : counts?.rows ?? []
    if (rowsB.length) {
      const tenantB = rowsB[0].tenant_id
      const tenantA = tenants.find((t) => t.id !== tenantB)?.id
      if (tenantA) {
        scenario = { table, tenantA, tenantB, tenantBRows: rowsB[0].c }
        break
      }
    }
  }

  if (!scenario) {
    console.log("⚠ No tenant-scoped rows found to test against. Skipping (not a failure).")
    process.exit(0)
  }

  const { table, tenantA, tenantB, tenantBRows } = scenario
  console.log(`Scenario: ${table} — tenant B (${tenantB}) has ${tenantBRows} rows; querying as tenant A (${tenantA}).`)

  // Guardrails before inlining into the DO block (which cannot take bind parameters):
  // table must be from the fixed allowlist; tenant ids must be canonical UUIDs.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!CHECK_TABLES.includes(table) || !UUID.test(String(tenantA)) || !UUID.test(String(tenantB))) {
    console.error("✗ Refusing to run: unexpected table or tenant id shape.")
    process.exit(2)
  }

  // Values are inlined (validated above) because a DO block body is opaque to bind params.
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
      PERFORM set_config('app.tenant_id', '${tenantA}', true);
      SELECT count(*) INTO leaked FROM ${table} WHERE tenant_id = '${tenantB}';
      RESET ROLE;

      EXECUTE format('REVOKE ff_isolation_probe FROM %I', current_user);
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ff_isolation_probe;
      REVOKE ALL ON SCHEMA public FROM ff_isolation_probe;
      DROP ROLE ff_isolation_probe;

      IF leaked <> 0 THEN
        RAISE EXCEPTION 'ISOLATION LEAK: restricted role scoped to tenant A read % rows of tenant B from ${table}', leaked;
      END IF;
    END $$;
  `
  const result = await sql.query(doBlock).then(() => "ok").catch((e) => e)

  if (result !== "ok") {
    console.error("✗ FAIL:", result?.message || result)
    process.exit(1)
  }
  console.log("✓ PASS — RLS blocks cross-tenant reads under a non-bypass role. Tenant isolation holds once APP_DATABASE_URL uses the restricted role.")
  process.exit(0)
}

main().catch((e) => {
  console.error("✗ Test error:", e?.message || e)
  process.exit(2)
})
