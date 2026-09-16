import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import { classifyStoredPasswordHash, verifyPassword } from "@/lib/passwords"
// .mjs helper shared with the migration runner; allowJs resolves it without a declaration file.
import { splitSqlStatements } from "../scripts/migrate-utils.mjs"

/**
 * No migration, seed or script may contain a value that could function as a password.
 *
 * ⚠ ONE DID, FOR A YEAR, IN A PUBLIC REPOSITORY. scripts/17-add-owner-role-and-user.sql carried an
 * unsalted SHA-256 hash for the `owner` account, and lib/passwords.ts still treats any 64-hex
 * value as a LIVE `legacy_sha256` login rather than a disabled artifact. Recovering the plaintext
 * was an offline brute force against a hash published on GitHub. Found by the QA scanner
 * 2026-09-16.
 *
 * Neither database ever held it — production and dev both had 0 matching rows and 0 legacy_sha256
 * accounts at all — so nothing was exposed and there was nothing to rotate. The danger was that
 * the same file's `ON CONFLICT … SET password_hash = EXCLUDED.password_hash` would have RESET a
 * real owner password to the published value on any re-run, restore or fresh bootstrap. One
 * command away from true, with no error to notice.
 *
 * The file is fixed. This is what stops the next one, because the reason it survived so long is
 * that nothing ever looked.
 */

/**
 * ⚠ THE FIRST VERSION OF THIS LINE SCANNED THE WRONG FILES, and every assertion below passed
 * against the unfixed migration because of it.
 *
 * It used `git ls-files 'scripts/**\/*.sql'`. In git's pathspec globbing that matches only files
 * in a SUBDIRECTORY of scripts/ — two files — while the 153 migrations that live directly in
 * `scripts/` matched nothing. Migration 17, the entire subject of this test, was never read.
 *
 * It was invisible because the sibling `'scripts/**\/*.mjs'` glob returned 65 files, so even the
 * "this cannot pass by scanning nothing" guard below was satisfied by a count from the wrong
 * pattern. Caught by restoring the original migration and watching all seven tests stay green.
 *
 * Listing the directory and filtering in JS has no glob semantics to get wrong.
 */
const files = execSync("git ls-files scripts/", { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(sql|mjs|js|cjs|ts)$/.test(f))

/**
 * SQL with comments removed — for checks about what a statement DOES.
 *
 * ⚠ Needed the moment the checks became statement-scoped: migration 17's own explanatory comment
 * quotes the dangerous line it replaced (`SET password_hash = EXCLUDED.password_hash`), and the
 * conflict check duly flagged the fixed file for describing the bug it fixes. A comment is not
 * executable and must not be read as though it were.
 *
 * Deliberately NOT used by the 64-hex check: a published hash sitting in a comment is still
 * published, so that one keeps comments in scope.
 */
const stripSqlComments = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")

/** 64 hex characters — exactly what classifyStoredPasswordHash accepts as a usable login. */
const SHA256_LITERAL = /['"`]([a-f0-9]{64})['"`]/gi

describe("scripts carry no usable credential", () => {
  it("actually reads the migrations, named one by one rather than counted", () => {
    /**
     * A count is what let the broken glob through: 65 files from the wrong pattern satisfied
     * "more than 50". Naming the file this test exists for is the assertion that cannot be
     * satisfied by scanning something else.
     */
    expect(files).toContain("scripts/17-add-owner-role-and-user.sql")
    expect(files.filter((f) => f.endsWith(".sql")).length).toBeGreaterThan(100)
  })

  it("no script puts a 64-hex literal in the same statement as a password column", () => {
    /**
     * ⚠ SCOPED TO THE STATEMENT, NOT TO A CHARACTER WINDOW. The first version asked whether
     * `password_hash` appeared within 400 characters before the literal — so a migration that
     * carried a long comment, a CTE, or simply more columns between the two would have slipped
     * past a check whose entire job is catching a published credential. Raised by Greptile on
     * PR #23 as "bounded matching windows that future SQL formatting can bypass".
     *
     * splitSqlStatements is the repo's own parser (scripts/migrate-utils.mjs, used by the
     * migration runner and dollar-quote aware), so this agrees with how the SQL is actually
     * executed instead of approximating it with a number nobody can justify.
     */
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, "utf8")
      if (!/password_hash/i.test(src)) continue

      const units: string[] = file.endsWith(".sql")
        ? (splitSqlStatements(src) as string[])
        : [src] // a JS/TS file has no statements to split; the whole file is the unit
      for (const unit of units) {
        if (!/password_hash/i.test(unit)) continue
        for (const m of unit.matchAll(SHA256_LITERAL)) {
          offenders.push(`${file}: ${m[1].slice(0, 12)}…`)
        }
      }
    }
    expect(
      offenders,
      "a 64-hex literal in a statement touching password_hash is a WORKING legacy_sha256 login, and this repo is public",
    ).toEqual([])
  })

  it("no migration overwrites an existing password_hash on conflict", () => {
    /**
     * The second half of the same defect, and the half that would actually have caused harm. A
     * schema migration has no business rewriting a credential: re-running it silently replaces a
     * password somebody chose with whatever the file happens to carry.
     */
    const offenders: string[] = []
    for (const file of files.filter((f) => f.endsWith(".sql"))) {
      for (const raw of splitSqlStatements(readFileSync(file, "utf8")) as string[]) {
        const statement = stripSqlComments(raw)
        // Statement-scoped for the same reason as above: the previous {0,200}/{0,400} bounds
        // meant a long SET clause or a comment between ON CONFLICT and DO UPDATE walked through.
        if (!/ON CONFLICT/i.test(statement)) continue
        const at = statement.search(/DO\s+UPDATE/i)
        if (at === -1) continue
        if (/password_hash\s*=/i.test(statement.slice(at))) offenders.push(file)
      }
    }
    expect(
      offenders,
      "this rewrites a real password on every re-run, restore or fresh bootstrap",
    ).toEqual([])
  })
})

describe("the placeholder left behind cannot be used to log in", () => {
  /**
   * Getting this wrong would have been worse than leaving the hash. A readable placeholder is not
   * 64 hex, so it classifies as `legacy_plaintext` — and if verifyPassword accepted plaintext, the
   * placeholder itself would BE the password, published in the repo. It does not, and this pins
   * that, because the safety of the fix depends entirely on it.
   */
  const placeholder = "NO-LOGIN-set-a-password-through-the-app"

  it("classifies as legacy_plaintext, not as a usable hash", () => {
    expect(classifyStoredPasswordHash(placeholder)).toBe("legacy_plaintext")
  })

  it("refuses the placeholder as its own password", () => {
    expect(verifyPassword(placeholder, placeholder).matches).toBe(false)
  })

  it("refuses everything else against it too", () => {
    for (const guess of ["", "owner", "password", placeholder.toLowerCase()]) {
      expect(verifyPassword(guess, placeholder).matches).toBe(false)
    }
  })

  it("and a 64-hex value WOULD have been accepted — which is why the old line mattered", () => {
    // The counter-example that gives the tests above their meaning.
    const sha256OfSecret = "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"
    expect(classifyStoredPasswordHash(sha256OfSecret)).toBe("legacy_sha256")
    expect(verifyPassword("password", sha256OfSecret).matches).toBe(true)
  })
})

describe("the remediation path cannot activate the placeholder", () => {
  /**
   * ⚠ MY OWN FIX POINTED AT A SCRIPT THAT WOULD HAVE UNDONE IT. Migration 17's new comment said
   * the first owner's password could be set "via scripts/64-password-hardening.mjs". That script's
   * `--apply-plaintext` mode runs `hashPassword(row.password_hash)` — it scrypt-hashes the value
   * ALREADY IN THE COLUMN.
   *
   * For a genuine legacy plaintext password that is correct: the user knows it, and hashing it in
   * place preserves their login while removing the plaintext. For the placeholder it is
   * catastrophic — it would mint a valid owner credential whose plaintext is printed in a public
   * repository. Strictly worse than the SHA-256 hash the migration was fixed to remove, because a
   * published plaintext needs no cracking at all.
   *
   * Raised by Greptile on PR #23, against the remediation advice rather than the code. A fix's
   * instructions are part of the fix.
   */
  const hardening = readFileSync("scripts/64-password-hardening.mjs", "utf8")
  const migration = readFileSync("scripts/17-add-owner-role-and-user.sql", "utf8")

  it("the hardening script knows about the sentinel and skips it", () => {
    expect(hardening).toContain("NON_CREDENTIAL_SENTINELS")
    expect(hardening).toContain("NO-LOGIN-set-a-password-through-the-app")
    // The filter must be applied to the rows it re-hashes, not merely declared.
    expect(hardening).toMatch(/plaintextRows\.filter\(\(row\) => !isNonCredentialSentinel/)
  })

  it("the sentinel the script guards is the one the migration actually writes", () => {
    // Two copies of a string in two languages; if they drift the guard silently stops matching.
    const seeded = migration.match(/'(NO-LOGIN-[^']+)'/)?.[1]
    expect(seeded, "migration 17 no longer seeds the expected placeholder").toBeTruthy()
    expect(hardening).toContain(seeded!)
  })

  it("and the migration no longer sends operators to that script", () => {
    const guidance = migration.slice(migration.indexOf("TO CREATE THE FIRST OWNER"))
    expect(guidance).not.toMatch(/via scripts\/64-password-hardening\.mjs/)
    expect(guidance).toMatch(/ACCEPTS A NEW SECRET/)
  })
})
