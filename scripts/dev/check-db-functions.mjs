#!/usr/bin/env node
/**
 * Does the database actually contain the functions and triggers the migrations claim to have
 * installed?
 *
 * Run: node scripts/dev/check-db-functions.mjs [--prod]
 *
 * WHY THIS EXISTS. `schema_migrations` records that a file RAN, not that its effect SURVIVED.
 * Those are different claims, and on 2026-09-10 they disagreed in production:
 *
 *   56-fix-processing-recompute-trigger-recursion.sql was recorded as applied on prod AND dev.
 *   Neither database had either guard it adds. The live function was byte-identical to the one
 *   from script 38, which 56 was written to replace.
 *
 * The consequence was not subtle. Without the pg_trigger_depth() guard the recompute trigger
 * updates the table it is triggered by, so every INSERT recursed until `stack depth limit
 * exceeded` (SQLSTATE 54001). Writing a processing record was impossible — a whole tab, dead, on
 * both databases, with the app shipping a bespoke error handler and a repair hint pointing at the
 * migration that was already marked done.
 *
 * CLAUDE.md already warns that "fully migrated is not quite true and never was — verify against
 * schema_migrations rather than trusting this line." This is the next turn of that screw: verify
 * against the DATABASE rather than trusting schema_migrations.
 *
 * HOW IT CHECKS. For every function defined by a `CREATE OR REPLACE FUNCTION` in scripts/, the
 * highest-numbered script that defines it wins. Distinctive tokens from that script's body (calls,
 * settings keys, column names — anything long enough not to be noise) must appear in the live
 * `pg_get_functiondef`. Postgres normalises whitespace and casing when it stores a function, so
 * comparing full text would produce nothing but false alarms; token presence survives that.
 */
import { readFileSync, readdirSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const PROD = process.argv.includes("--prod")
const envValue = (name) => {
  if (process.env[name]) return process.env[name]
  for (const f of PROD ? [".env.vercel.production"] : [".env.local", ".env"]) {
    try {
      const m = readFileSync(f, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))
      if (m) return m[1].trim().replace(/^["']|["']$/g, "")
    } catch {}
  }
  return null
}
const sql = neon(envValue(PROD ? "DATABASE_URL" : "DATABASE_URL_DEV"))

/** Migration number, numeric — "100-x.sql" sorts after "87-x.sql", which as strings it does not. */
const migrationNumber = (file) => Number(file.match(/^(\d+)/)?.[1] ?? -1)

const files = readdirSync("scripts")
  .filter((f) => f.endsWith(".sql"))
  .sort((a, b) => migrationNumber(a) - migrationNumber(b))

/** name -> { file, body } for the highest-numbered script defining it. */
const declared = new Map()
for (const file of files) {
  const src = readFileSync(`scripts/${file}`, "utf8")
  for (const m of src.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi)) {
    const name = m[1].toLowerCase()
    /**
     * The body runs from CREATE to the CLOSING DOLLAR QUOTE — not to the next CREATE, and not to
     * end of file. Scripts routinely follow a function with DROP TRIGGER / CREATE TRIGGER, and
     * slicing past the terminator pulled those in: the first version of this check reported
     * `trg_processing_records_recompute` and `to_regclass` as "missing from the function", which
     * is true and meaningless — they were never meant to be in it. A check that cries wolf on
     * correct code gets muted, and then it protects nothing.
     */
    const start = m.index
    const tail = src.slice(start)
    const open = tail.match(/AS\s+(\$[a-z_]*\$)/i)
    let body = tail
    if (open) {
      const openAt = tail.indexOf(open[1]) + open[1].length
      const closeAt = tail.indexOf(open[1], openAt)
      if (closeAt !== -1) body = tail.slice(0, closeAt + open[1].length)
    }
    declared.set(name, { file, body })
  }
}

/**
 * Tokens worth checking: long identifiers and setting keys. Short ones (`id`, `SET`) appear
 * everywhere and would pass regardless, which is a check that cannot fail.
 */
const tokensOf = (body) => {
  const stripped = body
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
  const found = new Set()
  for (const m of stripped.matchAll(/\b([a-z_][a-z0-9_]{9,})\b/gi)) found.add(m[1].toLowerCase())
  return [...found]
}

console.log(`\nChecking ${declared.size} declared function(s) against ${PROD ? "PRODUCTION" : "dev"}\n`)

let missing = 0
let drifted = 0
for (const [name, { file, body }] of [...declared].sort()) {
  const rows = await sql`SELECT pg_get_functiondef(oid) AS src FROM pg_proc WHERE proname = ${name}`
  if (!rows.length) {
    /**
     * A function whose table has since been dropped is correctly absent, not missing.
     * update_labor_deployments_updated_at is the standing example: labor_deployments was replaced
     * by the muster and dropped, so its trigger function went with it. Reporting that forever
     * would train a reader to skim past this output, which is how the real drift below survives.
     */
    const target = name.replace(/^update_/, "").replace(/_updated_at$/, "")
    const [{ t }] = await sql`SELECT to_regclass(${"public." + target}) AS t`
    if (t === null) continue
    missing++
    console.log(`  ABSENT   ${name}  (declared in ${file}) — not in the database at all`)
    continue
  }
  const live = rows[0].src.toLowerCase()
  const absent = tokensOf(body).filter((t) => !live.includes(t))
  if (absent.length) {
    drifted++
    console.log(`  DRIFTED  ${name}  (newest declaration: ${file})`)
    console.log(`           live definition is missing: ${absent.slice(0, 8).join(", ")}${absent.length > 8 ? ` … +${absent.length - 8}` : ""}`)
  }
}

const triggers = await sql`
  SELECT c.relname AS table_name, t.tgname
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
  ORDER BY 1, 2`
console.log(`\n${triggers.length} trigger(s) installed.`)

if (!missing && !drifted) {
  console.log("\n✓ Every declared function matches its newest migration.\n")
} else {
  console.log(`\n✗ ${missing} absent, ${drifted} drifted. A migration recorded as applied is not proof its effect survived.\n`)
  process.exitCode = 1
}
