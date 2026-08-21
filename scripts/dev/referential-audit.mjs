/**
 * Does every reference actually point at something, and at something of its own tenant?
 *
 * Run: node --env-file=.env.local scripts/dev/referential-audit.mjs
 *      node scripts/dev/referential-audit.mjs prod   (DATABASE_URL exported)
 *
 * FarmFlow's isolation story is tenant_id on every table plus RLS. That protects reads. It does
 * not, on its own, stop a row in tenant A carrying a location_id belonging to tenant B -- RLS
 * filters what you can see, not what you can write into a foreign key column. Nor does it notice
 * a location_id left pointing at a deleted row. Both are silent: the join simply returns nothing
 * and the record reads as unattributed.
 *
 * Read-only. Reports; changes nothing.
 */
import { neon } from "@neondatabase/serverless"

const isProd = process.argv.includes("prod")
const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)
const label = isProd ? "PRODUCTION" : "dev"

const problems = []
const note = (severity, msg) => {
  problems.push({ severity, msg })
  console.log(`  ${severity === "high" ? "!!" : severity === "med" ? " !" : "  "}  ${msg}`)
}

console.log(`\n=== referential audit — ${label} ===\n`)

// ── 1. which tables carry the two linking columns ───────────────────────────────────────────
const cols = await sql`
  SELECT c.table_name, c.column_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_name = c.table_name AND t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.column_name IN ('tenant_id', 'location_id')
  ORDER BY c.table_name, c.column_name`

const byTable = new Map()
for (const r of cols) {
  if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Set())
  byTable.get(r.table_name).add(r.column_name)
}
const locTables = [...byTable].filter(([, s]) => s.has("location_id")).map(([t]) => t)
const tenantTables = [...byTable].filter(([, s]) => s.has("tenant_id")).map(([t]) => t)
console.log(`tables with location_id: ${locTables.length}   with tenant_id: ${tenantTables.length}\n`)

// ── 2. foreign keys actually declared ───────────────────────────────────────────────────────
const fks = await sql`
  SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`

const hasFk = (table, col) => fks.some((f) => f.table_name === table && f.column_name === col)

console.log("── location_id columns with no foreign key ──")
// Archived rows exist to outlive the operational data they came from; tying them to a live
// location would defeat archiving. Deliberate, so not a finding.
const looseLoc = locTables.filter((t) => !hasFk(t, "location_id") && t !== "transaction_history_archive")
if (looseLoc.length === 0) console.log("  none")
for (const t of looseLoc) note("med", `${t}.location_id has no FK to locations`)

console.log("\n── tenant_id columns with no foreign key ──")
const looseTenant = tenantTables.filter((t) => !hasFk(t, "tenant_id"))
if (looseTenant.length === 0) console.log("  none")
for (const t of looseTenant) note("low", `${t}.tenant_id has no FK to tenants`)

console.log("\n── delete rules on location_id (CASCADE would take data with the block) ──")
// A permission row is not a record. "This user may see this block" is meaningless once the block
// is gone, and keeping it would leave a dangling grant -- so user_locations cascading is correct,
// and flagging it every run would train the reader to skim past the line that matters.
const CASCADE_IS_CORRECT = new Set(["user_locations"])
for (const f of fks.filter((x) => x.column_name === "location_id")) {
  const risky = f.delete_rule === "CASCADE" && !CASCADE_IS_CORRECT.has(f.table_name)
  const aside = f.delete_rule === "CASCADE" && !risky ? "   (correct — a grant, not a record)" : risky ? "   <- deletes records with the location" : ""
  console.log(`  ${f.table_name.padEnd(28)} ON DELETE ${f.delete_rule}${aside}`)
  if (risky) note("high", `${f.table_name}.location_id is ON DELETE CASCADE`)
}

// ── 3. orphans: pointing at a location that no longer exists ────────────────────────────────
console.log("\n── orphaned location_id (points at a row that is gone) ──")
let orphanTotal = 0
for (const t of locTables) {
  const r = await sql.query(
    `SELECT COUNT(*)::int n FROM ${t} x
      WHERE x.location_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.id = x.location_id)`,
  ).catch(() => null)
  if (r && r[0].n > 0) { orphanTotal += r[0].n; note("high", `${t}: ${r[0].n} orphaned location_id`) }
}
if (orphanTotal === 0) console.log("  none")

// ── 4. cross-tenant: a record whose location belongs to a different tenant ──────────────────
console.log("\n── cross-tenant location_id (record and its location disagree on tenant) ──")
let crossTotal = 0
for (const t of locTables) {
  if (!byTable.get(t).has("tenant_id")) continue
  const r = await sql.query(
    `SELECT COUNT(*)::int n FROM ${t} x
      JOIN locations l ON l.id = x.location_id
      WHERE x.location_id IS NOT NULL AND l.tenant_id <> x.tenant_id`,
  ).catch(() => null)
  if (r && r[0].n > 0) { crossTotal += r[0].n; note("high", `${t}: ${r[0].n} row(s) point at ANOTHER TENANT's location`) }
}
if (crossTotal === 0) console.log("  none")

// ── 5. estate strings that no location actually uses ────────────────────────────────────────
console.log("\n── estate labels: spelling drift within a tenant ──")
const estates = await sql`
  SELECT t.name AS tenant, l.estate, COUNT(*)::int n
  FROM locations l JOIN tenants t ON t.id = l.tenant_id
  WHERE l.estate IS NOT NULL
  GROUP BY t.name, l.estate ORDER BY t.name, l.estate`
const perTenant = new Map()
for (const e of estates) {
  if (!perTenant.has(e.tenant)) perTenant.set(e.tenant, [])
  perTenant.get(e.tenant).push(e)
}
for (const [tenant, list] of perTenant) {
  const keys = new Map()
  for (const e of list) {
    const k = String(e.estate).trim().toLowerCase()
    keys.set(k, [...(keys.get(k) || []), e.estate])
  }
  for (const [, spellings] of keys) {
    if (new Set(spellings).size > 1) note("med", `${tenant}: same estate spelled ${spellings.map((s) => `"${s}"`).join(" and ")}`)
  }
  console.log(`  ${tenant.padEnd(18)} ${list.map((e) => `${e.estate}(${e.n})`).join("  ")}`)
}

// ── 6. blocks with no estate while the tenant uses estates elsewhere ────────────────────────
console.log("\n── locations left out of a tenant's estate grouping ──")
const stragglers = await sql`
  SELECT t.name AS tenant, l.name, l.kind
  FROM locations l JOIN tenants t ON t.id = l.tenant_id
  WHERE l.estate IS NULL AND l.kind <> 'store'
    AND EXISTS (SELECT 1 FROM locations o WHERE o.tenant_id = l.tenant_id AND o.estate IS NOT NULL)
  ORDER BY t.name, l.name`
if (stragglers.length === 0) console.log("  none")
for (const s of stragglers) note("med", `${s.tenant}: "${s.name}" (${s.kind}) has no estate while its siblings do`)

// ── 7. stock sitting somewhere that is not a store ──────────────────────────────────────────
console.log("\n── stock held outside a storehouse ──")
const misplaced = await sql`
  SELECT t.name AS tenant, COALESCE(l.name, '(no location)') AS loc, COALESCE(l.kind, 'none') AS kind, COUNT(*)::int n
  FROM current_inventory ci
  JOIN tenants t ON t.id = ci.tenant_id
  LEFT JOIN locations l ON l.id = ci.location_id
  WHERE ci.quantity <> 0 AND (l.kind IS DISTINCT FROM 'store')
  GROUP BY t.name, l.name, l.kind ORDER BY n DESC`
if (misplaced.length === 0) console.log("  none")
for (const m of misplaced) note("med", `${m.tenant}: ${m.n} stock row(s) in "${m.loc}" which is a ${m.kind}, not a store`)

// ── 8. an estate that has blocks but no store to draw stock from ────────────────────────────
console.log("\n── estates with blocks but no storehouse (and no shared one) ──")
const noStore = await sql`
  SELECT DISTINCT t.name AS tenant, b.estate
  FROM locations b JOIN tenants t ON t.id = b.tenant_id
  WHERE b.kind = 'block' AND b.estate IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM locations s WHERE s.tenant_id = b.tenant_id AND s.kind = 'store' AND (s.estate = b.estate OR s.estate IS NULL))
  ORDER BY t.name, b.estate`
if (noStore.length === 0) console.log("  none")
for (const e of noStore) note("med", `${e.tenant}: estate "${e.estate}" has blocks but no store on it or shared`)

console.log(`\n${problems.length === 0 ? "clean" : `${problems.filter((p) => p.severity === "high").length} high, ${problems.filter((p) => p.severity === "med").length} medium, ${problems.filter((p) => p.severity === "low").length} low`}`)
