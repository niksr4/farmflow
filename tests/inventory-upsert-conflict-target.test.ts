import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every upsert aimed at a PARTIAL unique index must repeat that index's own predicate.
 *
 * THE BUG THIS EXISTS FOR. current_inventory's unique indexes are partial:
 *
 *   uq_current_inventory_item_tenant_location       (item_type, tenant_id, location_id)
 *                                                   WHERE location_id IS NOT NULL
 *   uq_current_inventory_item_tenant_null_location  (item_type, tenant_id)
 *                                                   WHERE location_id IS NULL
 *
 * Postgres matches a partial index only when the ON CONFLICT target repeats its WHERE clause.
 * Omit it and the statement fails at PLAN time -- "there is no unique or exclusion constraint
 * matching the ON CONFLICT specification" (42P10) -- taking the whole surrounding transaction
 * with it.
 *
 * app/api/expenses-neon wrote the located arm without the predicate. Every expense mutation
 * recalculates the affected stock, so deleting an expense rolled back and came back on reload
 * (the row hides behind the undo toast first, so it looked like it had worked), and editing one
 * failed outright with "Failed to process expense". Reported by HoneyFarm 2026-08-31, visible in
 * Sentry as [expense_update] x4 and [expense_delete] x3 from 2026-08-29.
 *
 * WHY IT SURVIVED SO LONG. The NULL arm was always correct. The broken arm only runs when the
 * stock line has a location, so while tenants still held stock in the unassigned pool the working
 * branch is the one that ran. Merging that pool into named stores gave every line a location and
 * turned a dormant bug into a total outage of expense editing -- a fix to one thing detonating
 * another, which no test asserted against.
 *
 * Counting sites rather than testing behaviour is deliberate: five of the six call sites were
 * always right, and a behavioural test over those five would have passed while the sixth was
 * breaking production.
 *
 * ── AND THEN IT HAPPENED AGAIN, 2026-09-11 ─────────────────────────────────────────────────────
 *
 * The version of this file written for that outage walked app/api and nothing else. The SIXTH
 * site was never in app/api at all: update_inventory(), the AFTER INSERT trigger on
 * transaction_history, carried the bare three-column target in SQL. Its sibling branch four lines
 * above -- same function, same IF -- had the NULL predicate and was correct, so the function
 * disagreed with itself exactly the way expenses-neon disagreed with its five neighbours.
 *
 * Reproduced on dev with a plain restock into a store holding no slot for the item: 42P10, insert
 * refused. Unreachable through the UI only because the create-item route opens a transaction that
 * upserts the slot BEFORE the opening movement, so the trigger always finds a match and never
 * reaches the INSERT arm. A convention in the caller was doing the work of a constraint.
 *
 * So the check is now general -- EVERY partial unique index in scripts/, matched against every
 * ON CONFLICT in TypeScript AND SQL -- because the lesson of the second occurrence is that the
 * first fix was scoped to where the bug had been rather than to where the rule applies.
 *
 * Fixed by scripts/151-update-inventory-onconflict-partial-index.sql.
 */

const ROOT = resolve(__dirname, "..")
const API = resolve(ROOT, "app/api")
const SCRIPTS = resolve(ROOT, "scripts")

const walk = (dir: string, keep: (name: string) => boolean): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry)
    return statSync(full).isDirectory() ? walk(full, keep) : keep(entry) ? [full] : []
  })

const rel = (file: string) => file.slice(ROOT.length + 1)

const migrationNumber = (file: string) => Number(file.match(/(\d+)/)?.[1] ?? -1)

/**
 * Migrations whose function definition a later migration has replaced.
 *
 * 18, 58 and 59 each declare update_inventory() with the bare target that 151 fixes. They are
 * history: already applied, superseded in the live catalog by the newest CREATE OR REPLACE, and
 * unchangeable without rewriting a ledger the migration runner keys off. Flagging them would be a
 * standing failure nobody can clear, and a check that cannot go green gets deleted.
 */
const supersededMigrations = () => {
  const definers = new Map<string, string[]>()
  for (const file of readdirSync(SCRIPTS).filter((f) => f.endsWith(".sql"))) {
    const src = readFileSync(resolve(SCRIPTS, file), "utf8")
    for (const m of src.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi)) {
      const name = m[1].toLowerCase()
      definers.set(name, [...(definers.get(name) ?? []), file])
    }
  }
  const stale = new Set<string>()
  for (const files of definers.values()) {
    const sorted = [...files].sort((a, b) => migrationNumber(a) - migrationNumber(b))
    for (const f of sorted.slice(0, -1)) stale.add(`scripts/${f}`)
  }
  return stale
}

/** Everywhere an upsert can be written: route handlers, server libs, migrations, ops scripts. */
const sourceFiles = () => {
  const stale = supersededMigrations()
  return [
    ...walk(resolve(ROOT, "app"), (n) => n.endsWith(".ts")),
    ...walk(resolve(ROOT, "lib"), (n) => n.endsWith(".ts")),
    ...walk(SCRIPTS, (n) => n.endsWith(".sql") || n.endsWith(".mjs")),
  ].filter((f) => !stale.has(rel(f)))
}

/**
 * SQL line comments describe the bug as often as they commit it — this very file's 151 quotes the
 * broken target verbatim to explain what was wrong with it. Strip them before scanning, or the fix
 * fails its own test for documenting itself.
 */
const stripSqlComments = (src: string) => src.replace(/^[ \t]*--.*$/gm, "")

/** A column list keyed so order does not matter — Postgres infers on the SET of columns. */
const key = (cols: string) =>
  cols
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|")

/**
 * Every partial unique index the migrations declare, keyed by its column set.
 *
 * Read from scripts/ rather than from a live database on purpose: this suite runs in CI with no
 * DATABASE_URL, and a check that silently skips when it cannot connect protects nothing.
 */
const partialUniqueIndexes = () => {
  const byTableAndColumns = new Map<string, { name: string; table: string; predicate: string }>()
  for (const file of readdirSync(SCRIPTS).filter((f) => f.endsWith(".sql"))) {
    const src = stripSqlComments(readFileSync(resolve(SCRIPTS, file), "utf8"))
    const re =
      /CREATE\s+UNIQUE\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_]+)\s+ON\s+(?:public\.)?([a-z0-9_]+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*WHERE\s+([^;]+);/gi
    for (const m of src.matchAll(re)) {
      const table = m[2].toLowerCase()
      byTableAndColumns.set(`${table}::${key(m[3])}`, {
        name: m[1],
        table,
        predicate: m[4].trim().replace(/\s+/g, " "),
      })
    }
  }
  return byTableAndColumns
}

/**
 * Every conflict target written anywhere, as (columns, predicate-or-null).
 *
 * Scans the region between `ON CONFLICT` and its `DO UPDATE` / `DO NOTHING`, so a target built by
 * a ternary — `ON CONFLICT ${workerId ? sql`(a, b) WHERE ...` : sql`(a) WHERE ...`}` — yields BOTH
 * arms rather than neither. A bare `ON CONFLICT DO NOTHING` has no target and needs no index, so
 * it contributes nothing and is correctly ignored.
 */
const conflictTargets = () => {
  const found: Array<{ file: string; table: string; columns: string; predicate: string | null; raw: string }> = []
  for (const file of sourceFiles()) {
    const raw = readFileSync(file, "utf8")
    const src = file.endsWith(".sql") ? stripSqlComments(raw) : raw
    for (const hit of src.matchAll(/ON\s+CONFLICT\b/gi)) {
      // The target names columns, never the table — so the table comes from the nearest INSERT
      // above. Without it, (tenant_id, record_date) matches BOTH the rainfall index and the rubber
      // one, and the check reports a rainfall statement against a rubber index.
      const before = src.slice(0, hit.index!)
      const insert = [...before.matchAll(/INSERT\s+INTO\s+(?:public\.)?([a-z0-9_]+)/gi)].at(-1)
      const table = insert?.[1]?.toLowerCase() ?? "?"

      const after = src.slice(hit.index! + hit[0].length)
      const stop = after.search(/\bDO\s+(?:UPDATE|NOTHING)\b/i)
      const head = stop === -1 ? after.slice(0, 400) : after.slice(0, stop)
      for (const t of head.matchAll(/\(([^()]*)\)(\s*WHERE\s+([^\n`]+?))?(?=\s*(?:`|\}|$|\n))/g)) {
        found.push({
          file: rel(file),
          table,
          columns: t[1],
          predicate: t[3]?.trim() ?? null,
          raw: t[0].trim().replace(/\s+/g, " "),
        })
      }
    }
  }
  return found
}

describe("upserts against a partial unique index repeat its predicate", () => {
  const indexes = partialUniqueIndexes()
  const targets = conflictTargets()

  it("finds the partial indexes, so a parser change cannot silently disarm this", () => {
    // 11 live on dev as of 2026-09-11 across current_inventory, worker_pay_rules, rainfall_records,
    // attendance_workers, data_integrity_exceptions, signup_requests and users.
    expect(indexes.size).toBeGreaterThanOrEqual(10)
  })

  it("finds the conflict targets, so a rewrite cannot silently disarm this either", () => {
    expect(targets.length).toBeGreaterThanOrEqual(20)
  })

  it("searches SQL as well as TypeScript — the second occurrence was a trigger function", () => {
    const scanned = new Set(sourceFiles().map(rel))
    expect(scanned).toContain("scripts/151-update-inventory-onconflict-partial-index.sql")
    expect(scanned).toContain("app/api/expenses-neon/route.ts")
  })

  it("no target names a partial index's columns without that index's predicate", () => {
    const broken = targets
      .filter((t) => indexes.has(`${t.table}::${key(t.columns)}`))
      .filter((t) => !t.predicate)
      .map((t) => {
        const idx = indexes.get(`${t.table}::${key(t.columns)}`)!
        return `${t.file}: INSERT INTO ${t.table} ... ON CONFLICT ${t.raw} cannot match ${idx.name} — needs WHERE ${idx.predicate}`
      })
    expect(broken, "a conflict target that matches no index fails at plan time with 42P10").toEqual([])
  })
})

describe("no source file is binary to the tools that read it", () => {
  /**
   * lib/server/biometric-attendance.ts carried a LITERAL NUL byte at offset 2588 -- a separator in
   * a dedup key, written as the raw character instead of the escape \0. The value is the same; the
   * consequence is not. grep, ripgrep, git diff and every code-review tool classify a file with a
   * NUL as binary and refuse to show its contents, so the file was invisible to text search while
   * looking perfectly ordinary in an editor.
   *
   * That matters more here than in most codebases: roughly seventy of these tests assert by
   * reading source and matching strings. They kept working (Node reads the file happily) but every
   * shell grep over it returned nothing at all -- including the ones run while chasing this very
   * bug class, which is how a real ON CONFLICT in that file came back "not found" twice.
   */
  it("contains no raw NUL bytes", () => {
    const offenders = sourceFiles()
      .concat(walk(resolve(ROOT, "components"), (n) => n.endsWith(".ts") || n.endsWith(".tsx")))
      .filter((f) => readFileSync(f).includes(0))
      .map(rel)
    expect(offenders, "write \\0 rather than the byte — a NUL makes the file binary to grep and git").toEqual([])
  })
})

describe("the two occurrences specifically", () => {
  it("the expense recalculation picks the arm by location, each with its own predicate", () => {
    const route = readFileSync(resolve(API, "expenses-neon/route.ts"), "utf8")
    expect(route).toContain("(item_type, tenant_id, location_id) WHERE location_id IS NOT NULL")
    expect(route).toContain("(item_type, tenant_id) WHERE location_id IS NULL")
  })

  it("the update_inventory trigger's located arm carries the predicate", () => {
    // The whole function is re-declared by 151; assert on the newest file that defines it so a
    // later CREATE OR REPLACE has to be looked at rather than quietly inheriting a pass.
    const defining = readdirSync(SCRIPTS)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?update_inventory\s*\(/i.test(
        readFileSync(resolve(SCRIPTS, f), "utf8"),
      ))
      .sort((a, b) => Number(a.match(/^(\d+)/)![1]) - Number(b.match(/^(\d+)/)![1]))
    const newest = defining.at(-1)!
    const src = readFileSync(resolve(SCRIPTS, newest), "utf8")
    expect(newest, "151 must still be the last word on update_inventory").toBe(
      "151-update-inventory-onconflict-partial-index.sql",
    )
    expect(src).toContain("ON CONFLICT (item_type, tenant_id, location_id) WHERE location_id IS NOT NULL")
    expect(src).toContain("ON CONFLICT (item_type, tenant_id) WHERE location_id IS NULL")
  })
})
