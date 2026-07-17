import { describe, it, expect } from "vitest"
import {
  splitSqlStatements,
  migrationNumberOf,
  findNewDuplicateMigrationNumbers,
  GRANDFATHERED_DUPLICATE_NUMBERS,
} from "../scripts/migrate-utils.mjs"

describe("splitSqlStatements", () => {
  it("splits simple statements on top-level semicolons", () => {
    expect(splitSqlStatements("SELECT 1; SELECT 2;")).toEqual(["SELECT 1", "SELECT 2"])
  })

  it("ignores a trailing statement without a semicolon", () => {
    expect(splitSqlStatements("SELECT 1;\nSELECT 2")).toEqual(["SELECT 1", "SELECT 2"])
  })

  it("drops empty fragments between semicolons", () => {
    expect(splitSqlStatements("SELECT 1;;;")).toEqual(["SELECT 1"])
  })

  it("keeps a DO $$ … $$ block intact even though it contains semicolons", () => {
    const sql = `
      DO $$
      BEGIN
        EXECUTE 'ALTER TABLE t ENABLE ROW LEVEL SECURITY';
        EXECUTE 'CREATE POLICY p ON t';
      END $$;
    `
    const stmts = splitSqlStatements(sql)
    expect(stmts).toHaveLength(1)
    expect(stmts[0]).toContain("DO $$")
    expect(stmts[0]).toContain("END $$")
  })

  it("handles a tagged dollar-quote ($body$ … $body$)", () => {
    const sql = `CREATE FUNCTION f() RETURNS int AS $body$ BEGIN RETURN 1; END; $body$ LANGUAGE plpgsql; SELECT f();`
    const stmts = splitSqlStatements(sql)
    expect(stmts).toHaveLength(2)
    expect(stmts[0]).toContain("$body$")
    expect(stmts[1]).toBe("SELECT f()")
  })

  it("does not treat a semicolon inside a line comment as a separator", () => {
    const stmts = splitSqlStatements("SELECT 1; -- a; b; c\nSELECT 2;")
    expect(stmts).toEqual(["SELECT 1", "-- a; b; c\nSELECT 2"])
  })

  it("returns an empty array for whitespace-only input", () => {
    expect(splitSqlStatements("   \n  \n")).toEqual([])
  })

  it("keeps two consecutive DO blocks separate", () => {
    const sql = `DO $$ BEGIN PERFORM 1; END $$;\nDO $$ BEGIN PERFORM 2; END $$;`
    expect(splitSqlStatements(sql)).toHaveLength(2)
  })
})

describe("migrationNumberOf", () => {
  it("extracts the numeric prefix", () => {
    expect(migrationNumberOf("98-enable-rls.sql")).toBe("98")
    expect(migrationNumberOf("09-drop.sql")).toBe("09")
  })

  it("returns undefined for a non-numbered filename", () => {
    expect(migrationNumberOf("app-runtime-role.sql")).toBeUndefined()
  })
})

describe("findNewDuplicateMigrationNumbers", () => {
  it("returns nothing when all numbers are unique", () => {
    expect(findNewDuplicateMigrationNumbers(["01-a.sql", "02-b.sql", "03-c.sql"])).toEqual([])
  })

  it("flags a new duplicate number", () => {
    const dups = findNewDuplicateMigrationNumbers(["50-a.sql", "50-b.sql"])
    expect(dups).toEqual(["50-a.sql & 50-b.sql"])
  })

  it("grandfathers known historic duplicate numbers", () => {
    const files = ["88-a.sql", "88-b.sql", "89-a.sql", "89-b.sql"]
    expect(findNewDuplicateMigrationNumbers(files, GRANDFATHERED_DUPLICATE_NUMBERS)).toEqual([])
  })

  it("flags a new duplicate even when grandfathered ones are also present", () => {
    const files = ["88-a.sql", "88-b.sql", "99-a.sql", "99-b.sql"]
    expect(findNewDuplicateMigrationNumbers(files, GRANDFATHERED_DUPLICATE_NUMBERS)).toEqual([
      "99-a.sql & 99-b.sql",
    ])
  })

  it("ignores files without a numeric prefix", () => {
    expect(findNewDuplicateMigrationNumbers(["app-runtime-role.sql", "notes.md"])).toEqual([])
  })
})
