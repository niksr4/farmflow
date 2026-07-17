#!/usr/bin/env node
// Fails if any public table carrying a tenant_id column does not have row-level security
// enabled AND forced. This makes tenant isolation a build-time invariant: add a tenant table
// without RLS and CI goes red. Run against the database in DATABASE_URL / DATABASE_URL_DEV.
//
//   node scripts/check-rls-coverage.mjs           # checks dev (DATABASE_URL_DEV) by default
//   node scripts/check-rls-coverage.mjs --prod    # checks prod (DATABASE_URL)
//
// Reads the connection string from the environment or a local .env file, mirroring migrate.mjs.

import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const useProd = process.argv.includes("--prod")

function loadEnvValue(name) {
  if (process.env[name]) return process.env[name]
  for (const file of [".env.local", ".env", ".env.vercel.production"]) {
    try {
      const line = readFileSync(file, "utf8")
        .split("\n")
        .find((l) => l.startsWith(`${name}=`))
      if (line) return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "")
    } catch {
      // file absent — try the next
    }
  }
  return null
}

const connectionString = useProd
  ? loadEnvValue("DATABASE_URL")
  : loadEnvValue("DATABASE_URL_DEV") || loadEnvValue("DATABASE_URL")

if (!connectionString) {
  console.error(`✗ No ${useProd ? "DATABASE_URL" : "DATABASE_URL_DEV"} found.`)
  process.exit(2)
}

const sql = neon(connectionString)

// Tables that legitimately have no tenant_id column are ignored automatically (we only
// inspect tenant_id-bearing tables). If a table SHOULD be global, it simply won't appear here.
const rows = await sql`
  SELECT c.table_name,
         COALESCE(pc.relrowsecurity, false)  AS rls_enabled,
         COALESCE(pc.relforcerowsecurity, false) AS rls_forced
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  LEFT JOIN pg_class pc
    ON pc.relname = c.table_name
  LEFT JOIN pg_namespace pn
    ON pn.oid = pc.relnamespace AND pn.nspname = c.table_schema
  WHERE c.table_schema = 'public'
    AND c.column_name = 'tenant_id'
    AND t.table_type = 'BASE TABLE'
  ORDER BY c.table_name
`

const uncovered = rows.filter((r) => !r.rls_enabled || !r.rls_forced)

console.log(`Checked ${rows.length} tenant_id tables on ${useProd ? "PROD" : "DEV"}.`)
if (uncovered.length === 0) {
  console.log("✓ Every tenant table has RLS enabled and forced.")
  process.exit(0)
}

console.error(`✗ ${uncovered.length} tenant table(s) missing RLS:`)
for (const r of uncovered) {
  console.error(`   - ${r.table_name} (enabled=${r.rls_enabled}, forced=${r.rls_forced})`)
}
console.error("Run scripts/98-enable-rls-all-tenant-tables.sql to fix.")
process.exit(1)
