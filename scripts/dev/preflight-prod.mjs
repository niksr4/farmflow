#!/usr/bin/env node
/**
 * Would the code on this branch work against the PRODUCTION database, right now?
 *
 *   pnpm preflight
 *
 * READ-ONLY. Opens prod, asks it what it has been migrated to, and compares that against the
 * migration files on this branch. Writes nothing.
 *
 * WHY THIS EXISTS. Merging to main is deploying here -- there is no staging step between the two.
 * So the question "does prod have the columns this code reads" has to be asked BEFORE the merge,
 * and nothing was asking it. On 2026-10-12 the answer was no: PR #75 and #79 read seven columns on
 * picking_records that migration 154 creates, and 154 was not applied to prod. Merging either one
 * would have 500'd the picking, payroll and reconciliation routes for every tenant.
 *
 * That was caught by hand. This is the version that cannot be forgotten.
 *
 * ⚠ IT CANNOT TELL YOU A MIGRATION IS SAFE, only that it is absent. 153 rewrites coffee_type and
 * bag_type on real sales and dispatch rows; 154 replaces the labour_cost view that every money
 * screen reads. Absence is mechanical and this checks it. Whether applying the thing is safe is a
 * judgement, and still yours -- diff the view arms, count the rows it would touch, and find out
 * which tenants own them.
 */
import { readFileSync, readdirSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

import { pendingMigrations, preflightBlocks } from "./release-utils.mjs"

// Prod's connection string lives in .env.vercel.production, NOT .env.local -- which holds the dev
// one under a similar name. Reading the wrong file here would compare this branch against dev and
// report everything applied, which is the exact false green this script exists to prevent.
const envValue = (name, files) => {
  if (process.env[name]) return process.env[name]
  for (const f of files) {
    try {
      const m = readFileSync(f, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))
      if (m) return m[1].trim().replace(/^["']|["']$/g, "")
    } catch {}
  }
  return null
}

const url = envValue("DATABASE_URL", [".env.vercel.production"])
if (!url) {
  console.error("No DATABASE_URL in .env.vercel.production -- cannot ask production anything.")
  process.exit(1)
}

const sql = neon(url)
let problems = 0
const bad = (line) => {
  problems += 1
  console.log(`  ⚠ ${line}`)
}

console.log("\nPRODUCTION SCHEMA PREFLIGHT  (read-only)\n")

// ── Migrations ────────────────────────────────────────────────────────────────────────────────
const applied = (await sql`SELECT version FROM schema_migrations`).map((r) => r.version)
const files = readdirSync("scripts")
const { pending, ghosts } = pendingMigrations(files, applied)

console.log(`MIGRATIONS   ${applied.length} applied on prod, ${files.filter((f) => /^\d+-.*\.sql$/.test(f)).length} files on this branch`)

if (pending.length === 0) {
  console.log("  ✓ prod has every migration this branch carries")
} else {
  bad(`${pending.length} migration(s) on this branch are NOT applied to prod:`)
  for (const f of pending) console.log(`      ${f}`)
  console.log("\n    Any code that reads what these create will 500 in production.")
  console.log("    Apply from a branch whose scripts/ ends at the one you want -- the runner has")
  console.log("    no --only flag and applies everything pending in the working tree:")
  console.log("\n      set -a && source .env.vercel.production && set +a && pnpm migrate:prod\n")
}

/**
 * ⚠ A GHOST IS A NOTE, NOT A BLOCKER. See preflightBlocks for the reasoning: older code against
 * newer schema is the forward-compatible direction and the correct order for a staged rollout.
 * This used to call bad() and therefore fail the run, which made the whole gate unusable the hour
 * migration 154 reached prod -- every branch without a 154 file became undeployable, including the
 * one carrying the code 154 was applied for.
 */
if (ghosts.length > 0) {
  console.log(`  ℹ prod has ${ghosts.length} migration(s) with no file on this branch:`)
  for (const f of ghosts) console.log(`      ${f}`)
  console.log("    This branch predates a schema change. Older code on newer schema is fine, so")
  console.log("    this does not block -- but rebase before adding anything that reads those columns.")
}

// ── Feature schema specs ──────────────────────────────────────────────────────────────────────
// config/schema-readiness.json is a hand-kept list of feature specs, so it only covers what
// somebody remembered to add. It is checked anyway because what it does cover it covers properly,
// but the migration comparison above is the one that generalises.
const specs = JSON.parse(readFileSync("config/schema-readiness.json", "utf8"))
const tables = new Set(
  (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`).map((r) => r.table_name),
)
const columns = new Map()
for (const r of await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`) {
  if (!columns.has(r.table_name)) columns.set(r.table_name, new Set())
  columns.get(r.table_name).add(r.column_name)
}

console.log(`\nFEATURE SPECS   ${specs.length} declared in config/schema-readiness.json`)
let specProblems = 0
for (const spec of specs) {
  const missingTables = (spec.requiredTables || []).filter((t) => !tables.has(t))
  const missingCols = Object.entries(spec.requiredColumns || {}).flatMap(([t, cols]) =>
    (cols || []).filter((c) => !(columns.get(t) || new Set()).has(c)).map((c) => `${t}.${c}`),
  )
  if (missingTables.length || missingCols.length) {
    specProblems += 1
    bad(`${spec.label} [${spec.severity}] -- missing ${[...missingTables, ...missingCols].join(", ")}`)
    if (spec.help) console.log(`      ${spec.help}`)
  }
}
if (specProblems === 0) console.log("  ✓ every declared feature spec is satisfied on prod")

// The blocking decision is a pure function so it can be tested, and so the two directions cannot
// quietly become symmetric again.
const blocks = preflightBlocks({ pending, ghosts, specProblems })

console.log(
  blocks
    ? `\n⚠ ${problems} PROBLEM(S) -- do not merge or alias until these are resolved\n`
    : ghosts.length > 0
      ? "\n✓ PREFLIGHT PASSES -- prod's schema can serve this branch (it is behind prod, which is fine)\n"
      : "\n✓ PREFLIGHT PASSES -- prod's schema can serve this branch\n",
)
process.exit(blocks ? 1 : 0)
