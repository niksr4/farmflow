#!/usr/bin/env node
/**
 * FarmFlow migration runner
 *
 * Usage:
 *   node scripts/migrate.mjs           # run against dev DB (DATABASE_URL_DEV)
 *   node scripts/migrate.mjs --prod    # run against prod DB (DATABASE_URL)
 *
 * On first run the schema_migrations table is created and all scripts up to
 * 87-default-activity-codes.sql are recorded as already-applied (they were
 * run manually before this runner existed). Only scripts numbered 88+ onward
 * will be executed.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { neon } from "@neondatabase/serverless"
import {
  GRANDFATHERED_DUPLICATE_NUMBERS,
  findNewDuplicateMigrationNumbers,
  splitSqlStatements,
} from "./migrate-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Env loading ──────────────────────────────────────────────────────────────

const parseEnvFile = (content) => {
  const values = {}
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const sep = line.indexOf("=")
    if (sep <= 0) continue
    const key = line.slice(0, sep).trim()
    let value = line.slice(sep + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) values[key] = value
  }
  return values
}

const loadRepoEnv = () => {
  const merged = {}
  for (const filename of [".env", ".env.local"]) {
    const envPath = path.join(process.cwd(), filename)
    if (fs.existsSync(envPath)) {
      Object.assign(merged, parseEnvFile(fs.readFileSync(envPath, "utf8")))
    }
  }
  return merged
}

const env = { ...loadRepoEnv(), ...process.env }
const isProd = process.argv.includes("--prod")

const normalizeStr = (v) => String(v || "").trim()
const dbUrl = isProd
  ? normalizeStr(env.DATABASE_URL)
  : normalizeStr(env.DATABASE_URL_DEV) || normalizeStr(env.DATABASE_URL)

if (!dbUrl) {
  console.error(
    isProd
      ? "Error: DATABASE_URL is not set."
      : "Error: DATABASE_URL_DEV (or DATABASE_URL) is not set.",
  )
  process.exit(1)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const toRows = (r) => (Array.isArray(r) ? r : r?.rows ?? [])

// The last migration script that was applied manually before this runner existed.
// All scripts up to and including this one will be bootstrapped as already-applied.
const BOOTSTRAP_CUTOFF = "87-default-activity-codes.sql"

// Execute a SQL string that may contain multiple statements (dollar-quote aware).
// NOTE: sql.query(text) executes; sql.unsafe(text) does NOT — it returns an UnsafeRawSql
// composition fragment, so `await sql.unsafe(stmt)` silently runs nothing. The runner
// shipped with .unsafe and recorded migrations in the ledger without applying them.
const execFile = async (sql, content) => {
  for (const stmt of splitSqlStatements(content)) {
    await sql.query(stmt)
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const sql = neon(dbUrl)

console.log(`\nFarmFlow migrations — ${isProd ? "PRODUCTION" : "development"}\n`)

// Ensure tracking table exists
await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT        PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`

// Discover SQL migration files
const allFiles = fs
  .readdirSync(__dirname)
  .filter((f) => /^\d{2,}-.*\.sql$/.test(f))
  .sort()

if (allFiles.length === 0) {
  console.log("No SQL migration files found.\n")
  process.exit(0)
}

// Guard against NEW duplicate migration numbers. The grandfathered numbers already had
// duplicate files when this guard was added — they are recorded by full filename and
// re-running them is harmless. Any NEW duplicate number is rejected so the ambiguity is
// caught in review rather than in production.
const newDuplicates = findNewDuplicateMigrationNumbers(allFiles, GRANDFATHERED_DUPLICATE_NUMBERS)
if (newDuplicates.length > 0) {
  console.error("Error: new duplicate migration number(s) detected:")
  for (const pair of newDuplicates) console.error(`  - ${pair}`)
  console.error("Renumber the newer file to keep ordering unambiguous.\n")
  process.exit(1)
}

// Check which are already recorded
const appliedRows = toRows(await sql`SELECT version FROM schema_migrations ORDER BY version`)
const applied = new Set(appliedRows.map((r) => r.version))

// Bootstrap: if the table is empty, mark all scripts up to the cutoff as applied.
// These were run manually before this runner existed.
if (applied.size === 0) {
  const baseline = allFiles.filter((f) => f <= BOOTSTRAP_CUTOFF)
  if (baseline.length > 0) {
    for (const file of baseline) {
      await sql`
        INSERT INTO schema_migrations (version) VALUES (${file})
        ON CONFLICT DO NOTHING
      `
      applied.add(file)
    }
    console.log(`  bootstrap  ${baseline.length} prior migrations recorded (not re-executed)\n`)
  }
}

// Run any unapplied scripts
let ran = 0
let skipped = 0

for (const file of allFiles) {
  if (applied.has(file)) {
    skipped++
    continue
  }

  const filePath = path.join(__dirname, file)
  const content = fs.readFileSync(filePath, "utf8")

  process.stdout.write(`  run   ${file} … `)
  try {
    await execFile(sql, content)
    await sql`INSERT INTO schema_migrations (version) VALUES (${file})`
    console.log("done")
    ran++
  } catch (err) {
    console.log("FAILED")
    console.error(`\nError in ${file}:\n${err.message}\n`)
    process.exit(1)
  }
}

if (ran === 0 && skipped > 0) {
  console.log(`  All ${skipped} migrations already applied. Nothing to do.`)
} else {
  console.log(`\n${ran} migration(s) applied, ${skipped} already up-to-date.`)
}
console.log()
