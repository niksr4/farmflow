import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The thing that proves tenant isolation must not choose what to prove.
 *
 * Until 2026-09-08 scripts/check-tenant-isolation.mjs held a fixed array of five table names,
 * probed THE FIRST ONE with rows, and printed "Tenant isolation holds". sales_records was first
 * and always had data, so in practice it had only ever proved sales_records — while every table
 * added since was covered by the sentence and not by the test: worker_ledger, labour_assignments,
 * attendance_workers, picking_records, and worker_pay_rules, which exists to hold what each person
 * is paid.
 *
 * Its sibling check-rls-coverage.mjs discovers by column and has always been right about its own
 * scope. The weaker of the two was making the louder claim.
 *
 * Discovery is the invariant, so discovery is what is asserted — a future edit that reintroduces a
 * hand-written list should fail here rather than quietly narrow what "isolation holds" means.
 */
const prover = readFileSync(resolve(__dirname, "../scripts/check-tenant-isolation.mjs"), "utf8")
const coverage = readFileSync(resolve(__dirname, "../scripts/check-rls-coverage.mjs"), "utf8")

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

describe("the isolation prover discovers its own scope", () => {
  const code = stripComments(prover)

  it("reads the table list from the catalogue, like the coverage checker does", () => {
    expect(code).toContain("information_schema.columns")
    expect(code).toContain("column_name = 'tenant_id'")
    // BASE TABLE only: a view has no rows of its own to leak and cannot carry a policy.
    expect(code).toContain("BASE TABLE")
  })

  it("has no hand-written list of tables to check", () => {
    // The exact shape of the old bug: `const CHECK_TABLES = ["sales_records", ...]`.
    expect(code).not.toMatch(/CHECK_TABLES\s*=\s*\[/)
    expect(code).not.toMatch(/const\s+\w*TABLES\w*\s*=\s*\[\s*"/)
  })

  it("probes every table it found data for, not the first one", () => {
    // `break` after the first hit is what made this a one-table test wearing a global claim.
    expect(code).toContain("scenarios.push")
    expect(code).not.toMatch(/scenario\s*=\s*\{[^}]*\}\s*\n\s*break/)
  })

  it("still validates identifiers before inlining them, because a DO block takes no binds", () => {
    expect(code).toContain("IDENTIFIER.test")
    expect(code).toContain("UUID.test")
  })

  it("says what it could NOT prove instead of counting it as a pass", () => {
    // An empty table proves nothing: reading zero rows of a table with zero rows is not isolation.
    // check-rls-coverage asserts the policy exists; this one asserts behaviour, and the difference
    // between them has to survive in the output or the claim overstates again.
    expect(code).toContain("unprovable")
    expect(code).toMatch(/asserted by policy only/)
  })

  it("cleans up the probe role even when the block aborts", () => {
    // The role is dropped inside the DO block, so a raised exception leaves it behind — a stray
    // grantee with SELECT on every table is not a thing to leave on a database.
    expect(code).toContain("DROP ROLE IF EXISTS ff_isolation_probe")
  })
})

describe("the two schema guards agree about what a tenant table is", () => {
  it("both discover by the tenant_id column rather than by name", () => {
    for (const source of [stripComments(prover), stripComments(coverage)]) {
      expect(source).toContain("column_name = 'tenant_id'")
    }
  })
})
