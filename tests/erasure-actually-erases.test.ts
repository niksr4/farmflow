import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  anonymizationExclusions,
  selectAnonymizationTargets,
} from "../lib/server/privacy"

/**
 * "DELETE MY DATA" MUST NOT LEAVE THE PERSON NAMED IN THOUSANDS OF ROWS.
 *
 * ⚠ anonymizeReferences WAS A HAND-WRITTEN LIST OF EIGHT UPDATES. The database has twenty-six
 * text columns on tenant tables holding a person's name, so erasure reported success while the
 * username survived everywhere that mattered. Measured for two real production accounts:
 *
 *   KAB123     1,958 rows (1,202 labour_assignments.recorded_by, 453 attendance_records.marked_by,
 *              172 labor_transactions.recorded_by, 131 expense_transactions.recorded_by)
 *   Gagan Rai  3,141 rows
 *
 * Not one of those four columns was on the list. Sixteen columns were missing in total.
 *
 * Same failure mode as the RLS wrapper guard that knew 40 of 53 tenant tables, and the seeding
 * deny-list that named one estate: a hand-kept list is how the next instance hides.
 */

/**
 * The catalogue as it actually is, read off dev on 2026-10-19. Used as a fixture so the filtering
 * decision is tested without a database -- the pure half of the fix takes rows, not a connection.
 */
const CATALOGUE = [
  ["attendance_records", "marked_by"],
  ["audit_logs", "username"],
  ["billing_invoices", "created_by"],
  ["compliance_checklist_items", "completed_by"],
  ["curing_records", "recorded_by"],
  ["dispatch_records", "created_by"],
  ["document_records", "uploaded_by"],
  ["expense_transactions", "recorded_by"],
  ["import_jobs", "requested_by"],
  ["journal_entries", "created_by"],
  ["labor_transactions", "recorded_by"],
  ["labour_assignments", "recorded_by"],
  ["other_sales_records", "created_by"],
  ["pepper_records", "recorded_by"],
  ["privacy_requests", "username"],
  ["quality_grading_records", "graded_by"],
  ["rainfall_records", "user_id"],
  ["security_events", "actor_username"],
  ["soil_tests", "recorded_by"],
  ["tenant_labour_entry_mode", "set_by"],
  ["transaction_history", "user_id"],
  ["transaction_history_archive", "archived_by"],
  ["transaction_history_archive", "user_id"],
  ["users", "username"],
  ["worker_ledger", "created_by"],
  ["worker_pay_rules", "created_by"],
].map(([table_name, column_name]) => ({ table_name, column_name }))

/** What the hand-written version actually swept, for the before/after comparison. */
const THE_OLD_EIGHT = new Set([
  "transaction_history.user_id",
  "rainfall_records.user_id",
  "dispatch_records.created_by",
  "curing_records.recorded_by",
  "quality_grading_records.graded_by",
  "pepper_records.recorded_by",
  "audit_logs.username",
  "privacy_requests.username",
])

describe("the swept set", () => {
  const targets = selectAnonymizationTargets(CATALOGUE)
  const names = targets.map((t) => `${t.table}.${t.column}`)

  it("is not vacuous", () => {
    expect(targets.length).toBeGreaterThanOrEqual(20)
  })

  it("covers the four columns that held 1,958 rows of a real writer's name", () => {
    // The specific columns measured on production. If a future change drops one, this names it.
    for (const column of [
      "labour_assignments.recorded_by",
      "attendance_records.marked_by",
      "labor_transactions.recorded_by",
      "expense_transactions.recorded_by",
    ]) {
      expect(names, `${column} is where a real erased user's name survived`).toContain(column)
    }
  })

  it("covers strictly more than the hand-written list did", () => {
    for (const old of THE_OLD_EIGHT) {
      if (old === "privacy_requests.username" || old === "users.username") continue
      expect(names, `${old} was swept before and must still be`).toContain(old)
    }
    const added = names.filter((n) => !THE_OLD_EIGHT.has(n))
    expect(
      added.length,
      "the derived sweep must cover columns the hand-written list missed",
    ).toBeGreaterThanOrEqual(15)
  })

  it("leaves out exactly the documented exemptions and nothing else", () => {
    const excluded = Object.keys(anonymizationExclusions())
    const missing = CATALOGUE.map((r) => `${r.table_name}.${r.column_name}`).filter(
      (n) => !names.includes(n),
    )
    expect(missing.sort()).toEqual([...excluded].sort())
  })

  it("has a reason recorded for every exemption, and each names a real column", () => {
    // An exemption list that outlives its reason is folklore. This fails if one goes stale.
    const catalogueNames = new Set(CATALOGUE.map((r) => `${r.table_name}.${r.column_name}`))
    for (const [name, reason] of Object.entries(anonymizationExclusions())) {
      expect(reason.length, `${name} has no recorded reason`).toBeGreaterThan(20)
      expect(
        catalogueNames.has(name),
        `${name} is exempted but is not a column the scan would find. Either the exemption is ` +
          "stale, or the catalogue query no longer matches it -- which is how a dead exemption " +
          "hid security_events.actor_username until the pattern was broadened.",
      ).toBe(true)
    }
  })

  it("refuses an identifier that is not a plain lowercase name", () => {
    // The names are concatenated into SQL, so they are validated even though they come from the
    // catalogue rather than from a request.
    const hostile = selectAnonymizationTargets([
      { table_name: "users; DROP TABLE users --", column_name: "username" },
      { table_name: "labour_assignments", column_name: "recorded_by) = x --" },
      { table_name: "Labour_Assignments", column_name: "recorded_by" },
    ])
    expect(hostile).toEqual([])
  })
})

describe("the catalogue query itself finds all three name shapes", () => {
  /**
   * ⚠ THE FIXTURE ABOVE TESTS THE FILTER, NOT THE QUERY, AND A TAMPER PROVED IT.
   *
   * Deleting `OR c.column_name LIKE '%\\_by'` from the SQL -- which removes nineteen of the
   * twenty-three swept columns and restores the original bug almost exactly -- left every test in
   * the block above green, because CATALOGUE is a hardcoded list rather than the query's output.
   * A test that supplies its own copy of the thing it is checking cannot see the real one change.
   *
   * There is no database in the unit suite, so the query cannot be executed here. Asserting the
   * three name shapes are present is weaker than running it, and it is not vacuous: it fails on
   * exactly the mutation the fixture missed.
   */
  const sql = readFileSync("lib/server/privacy.ts", "utf8")
  const query = sql.slice(
    sql.indexOf("const IDENTITY_NAME_COLUMNS_SQL"),
    sql.indexOf("const SAFE_IDENTIFIER"),
  )

  it("isolates the query, so these assertions are about something", () => {
    expect(query).toContain("information_schema.columns")
    expect(query.length).toBeGreaterThan(200)
  })

  it.each([
    ["columns ending in _by (recorded_by, marked_by, created_by...)", /LIKE '%\\?\\?_by'/],
    ["columns ending in username (username, actor_username)", /LIKE '%username'/],
    ["the user_id columns that hold a name rather than a uuid", /= 'user_id'/],
  ])("matches %s", (_label, pattern) => {
    expect(
      pattern.test(query),
      "this name shape is no longer matched, so those columns keep the erased person's name",
    ).toBe(true)
  })

  it("is restricted to text columns on tenant tables that really exist", () => {
    // uuid columns are opaque pointers, and three are NOT NULL so nulling them would throw.
    expect(query).toMatch(/data_type IN \('text', 'character varying'\)/)
    expect(query).toContain("column_name = 'tenant_id'")
    expect(query).toContain("table_type = 'BASE TABLE'")
  })
})

describe("the sweep cannot report success having done nothing", () => {
  const src = readFileSync("lib/server/privacy.ts", "utf8")

  it("throws when the catalogue query yields no targets", () => {
    // A schema rename or a permissions change would otherwise make erasure a no-op that reports
    // success -- precisely the failure being fixed, in a new disguise.
    expect(src).toMatch(/targets\.length === 0/)
    expect(src).toMatch(/refusing to report success/)
  })

  it("still handles privacy_requests by user_id, never by username", () => {
    /**
     * Load-bearing and easy to "tidy" into the derived loop. A username is freed on anonymization
     * and can be taken by somebody else, so matching by name would overwrite a PREVIOUSLY
     * anonymized person's deletion request with this user's handle. Raised by Greptile on PR #22.
     */
    /**
     * ⚠ SCOPE TO THE FUNCTION FIRST. There are TWO `UPDATE privacy_requests` statements in this
     * file -- the other one records a deletion request in the first place -- and taking the first
     * match asserted against the wrong statement and failed over correct code. Same family as the
     * query broad enough to match the totals card instead of the worker row.
     */
    const fn = src.slice(
      src.indexOf("const anonymizeReferences = async ("),
      src.indexOf("export async function anonymizeUserById"),
    )
    expect(fn.length, "could not isolate anonymizeReferences").toBeGreaterThan(200)
    const block = fn.slice(fn.indexOf("UPDATE privacy_requests"))
    const stmt = block.slice(0, block.indexOf("`"))
    expect(stmt).toMatch(/user_id = \$\{userId\}/)
    expect(
      /AND username = /.test(stmt),
      "matching privacy_requests by username would re-attribute a previously anonymized " +
        "person's own deletion request",
    ).toBe(false)
  })
})
