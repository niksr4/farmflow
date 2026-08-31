/**
 * Every activity code, everywhere, in one sheet — for restructuring the master list.
 *
 * Run: node --env-file=.env.local scripts/dev/export-activity-codes.mjs            (dev)
 *      DATABASE_URL=... node scripts/dev/export-activity-codes.mjs --prod          (production)
 *
 * Writes ~/Desktop/farmflow-activity-codes.csv unless --out is given.
 *
 * WHY IT CARRIES USAGE COUNTS. Restructuring is constrained by what has already been filed. A
 * code's NUMBER can never change once it exists -- app/api/get-activity refuses the rename, and
 * real foreign keys from expense_transactions and labor_transactions back it -- and a code with
 * any usage cannot be deleted either. What is always safe is editing the description, but that
 * RELABELS HISTORY: reports join on the code and print the current name, so renaming 157 changes
 * what every past entry says it was for. So "how many rows are filed under this" is the first
 * thing you need in front of you, not something to discover halfway through.
 */
import { neon } from "@neondatabase/serverless"
import { readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"

const isProd = process.argv.includes("--prod")
const outArg = process.argv.indexOf("--out")
const outPath =
  outArg !== -1 && process.argv[outArg + 1]
    ? resolve(process.argv[outArg + 1])
    : resolve(homedir(), "Desktop", "farmflow-activity-codes.csv")

const connection = isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV || process.env.DATABASE_URL
if (!connection) {
  console.error("No connection string. Set DATABASE_URL_DEV (dev) or DATABASE_URL (--prod).")
  process.exit(1)
}
const sql = neon(connection)

// The master list, read from source rather than re-typed, so this can never drift from what
// new tenants actually get.
const seedSource = readFileSync(resolve("lib/account-activity-suggestions.ts"), "utf8")
const seed = new Map(
  [...seedSource.matchAll(/\{ code: "([^"]+)", reference: "([^"]+)" \}/g)].map((m) => [m[1], m[2]]),
)

const tenants = await sql`SELECT id, name FROM tenants ORDER BY name`

// Demo and dormant tenants would add columns of noise to a sheet meant for decisions.
const SKIP = new Set(["Estate Mock", "greenvalley"])
const live = tenants.filter((t) => !SKIP.has(t.name))

const codeRows = await sql`SELECT tenant_id, code, activity FROM account_activities`

// Usage in all three places a code can be filed. labour_assignments is the muster and is the one
// most easily forgotten -- it is also the only one with no foreign key, so it is protected by
// application code alone.
const usage = async (table, codeCol, label) => {
  try {
    const rows = await sql.query(
      `SELECT tenant_id, ${codeCol} AS code, COUNT(*)::int AS n FROM ${table} GROUP BY tenant_id, ${codeCol}`,
    )
    return rows.map((r) => ({ ...r, label }))
  } catch {
    return []
  }
}
const usageRows = [
  ...(await usage("labor_transactions", "code", "labour")),
  ...(await usage("expense_transactions", "code", "expense")),
  ...(await usage("labour_assignments", "activity_code", "muster")),
]

const key = (tenantId, code) => `${tenantId}|${String(code).toUpperCase()}`
const nameByTenantCode = new Map(codeRows.map((r) => [key(r.tenant_id, r.code), String(r.activity)]))
const usageByTenantCode = new Map()
for (const r of usageRows) {
  if (!r.code) continue
  const k = key(r.tenant_id, r.code)
  usageByTenantCode.set(k, (usageByTenantCode.get(k) || 0) + Number(r.n || 0))
}

// Every code that exists anywhere: the seed plus anything a tenant has invented.
const allCodes = new Set([...seed.keys()])
for (const r of codeRows) {
  if (live.some((t) => t.id === r.tenant_id)) allCodes.add(String(r.code).toUpperCase())
}

const numeric = (code) => (/^\d+/.test(code) ? Number.parseInt(code, 10) : Number.MAX_SAFE_INTEGER)
const sorted = [...allCodes].sort((a, b) => numeric(a) - numeric(b) || a.localeCompare(b))

const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`

const header = [
  "Code",
  "Master list (what new tenants get)",
  ...live.flatMap((t) => [`${t.name} — name`, `${t.name} — rows filed`]),
  "Total rows filed",
  "Number locked?",
  "Differs from master",
  "Notes for the restructure",
]

const lines = [header.map(esc).join(",")]

for (const code of sorted) {
  const master = seed.get(code) || ""
  const perTenant = live.map((t) => ({
    name: nameByTenantCode.get(key(t.id, code)) || "",
    used: usageByTenantCode.get(key(t.id, code)) || 0,
  }))
  const total = perTenant.reduce((sum, x) => sum + x.used, 0)
  const differing = live
    .map((t, i) => ({ tenant: t.name, name: perTenant[i].name }))
    .filter((x) => x.name && master && x.name !== master)
    .map((x) => `${x.tenant}: "${x.name}"`)
    .join("; ")

  const notes = []
  if (!master && perTenant.some((x) => x.name)) notes.push("not in master list")
  if (master && perTenant.every((x) => !x.name)) notes.push("in master list, no tenant uses it")
  if (total > 0) notes.push(`${total} rows filed — description can change, number cannot`)
  else notes.push("unused — safe to renumber or delete")

  lines.push(
    [
      code,
      master,
      ...perTenant.flatMap((x) => [x.name, x.used || ""]),
      total || "",
      total > 0 ? "LOCKED" : "",
      differing,
      notes.join("; "),
    ]
      .map(esc)
      .join(","),
  )
}

writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

console.log(`\n${outPath}`)
console.log(`  ${sorted.length} codes across ${live.length} live tenants (${isProd ? "PRODUCTION" : "dev"})`)
console.log(`  master list: ${seed.size}`)
console.log(`  locked (have rows filed): ${sorted.filter((c) => live.some((t) => usageByTenantCode.get(key(t.id, c)))).length}`)
console.log(`  not in master list: ${sorted.filter((c) => !seed.has(c)).length}`)
console.log(`  in master, nobody uses: ${sorted.filter((c) => seed.has(c) && !live.some((t) => nameByTenantCode.has(key(t.id, c)))).length}\n`)
