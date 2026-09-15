import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import { classifyStoredPasswordHash, verifyPassword } from "@/lib/passwords"

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

  it("no script contains a 64-hex literal near a password column", () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, "utf8")
      if (!/password_hash|password/i.test(src)) continue
      for (const m of src.matchAll(SHA256_LITERAL)) {
        // A 64-hex literal is only dangerous where it can reach a password column. Elsewhere in a
        // migration it is a checksum or an id and has nothing to do with logging in.
        const around = src.slice(Math.max(0, m.index! - 400), m.index! + 200)
        if (/password_hash/i.test(around)) offenders.push(`${file}: ${m[1].slice(0, 12)}…`)
      }
    }
    expect(
      offenders,
      "a 64-hex literal next to password_hash is a WORKING legacy_sha256 login, and this repo is public",
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
      const src = readFileSync(file, "utf8")
      for (const m of src.matchAll(/ON CONFLICT[\s\S]{0,200}?DO UPDATE\s+SET([\s\S]{0,400}?);/gi)) {
        if (/password_hash\s*=/i.test(m[1])) offenders.push(file)
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
