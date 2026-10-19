import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  WORKER_PII_FIELDS,
  canReadWorkerPii,
  redactWorkerPii,
  stripWorkerPiiWrites,
} from "../lib/server/worker-pii"

/**
 * WORKER BANK DETAILS AND PHONE NUMBERS MUST NOT REACH A role=user RESPONSE.
 *
 * GET /api/attendance and GET /api/attendance/workers/[id] were guarded by
 * requireModuleAccess("accounts") and nothing else, and returned account number, IFSC and phone
 * for every worker. `accounts` is tenant-enabled for all six tenants and only `balance-sheet` is
 * in USER_ROLE_BLOCKED_MODULES, so a writer with no user_modules rows reads it as enabled.
 *
 * Reported adoption at the time of the fix: 43 of 58 workers at one estate had account number,
 * IFSC and phone populated, and that estate has a live role=user account.
 */

/** Comments stripped: the fix below documents the fields it protects, by name. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

describe("redactWorkerPii", () => {
  const full = { name: "A", phone: "9876543210", bankName: "SBI", bankAccount: "123", bankIfsc: "SBIN1" }

  it("protects a non-empty set of fields, so the helper cannot be vacuous", () => {
    expect(WORKER_PII_FIELDS.length).toBeGreaterThanOrEqual(4)
  })

  it("blanks every protected field for a writer", () => {
    const out = redactWorkerPii(full, "user") as Record<string, unknown>
    for (const field of WORKER_PII_FIELDS) {
      expect(out[field], `${field} reached a role=user response`).toBeNull()
    }
    // Non-PII fields survive, or the roster would be unusable for the person marking attendance.
    expect(out.name).toBe("A")
  })

  it("keeps the keys present, so the response shape does not vary by role", () => {
    const out = redactWorkerPii(full, "user")
    for (const field of WORKER_PII_FIELDS) expect(field in out).toBe(true)
  })

  it("gives admin and owner the real values", () => {
    for (const role of ["admin", "owner"]) {
      const out = redactWorkerPii(full, role) as Record<string, unknown>
      expect(out.bankAccount, `${role} must still see bank details`).toBe("123")
      expect(out.phone).toBe("9876543210")
    }
  })

  it("fails closed on an unknown or absent role", () => {
    for (const role of [null, undefined, "", "manager", "viewer"]) {
      expect(canReadWorkerPii(role as string)).toBe(false)
      expect((redactWorkerPii(full, role as string) as Record<string, unknown>).bankAccount).toBeNull()
    }
  })
})

/**
 * SCOPED TO WORKER PII DELIBERATELY.
 *
 * `other_sales_records.bank_account` and `sales_records.bank_account` are a BUYER's account,
 * entered by the estate about its own counterparty, behind a different module gate. Whether a
 * writer should see those is a separate product question and is recorded as open rather than
 * quietly folded in here -- 19 sales rows and 1 other-sales row carry one today.
 */
describe("every route that reads worker bank columns redacts them", () => {
  /**
   * Derived from the tree, not a list of the two routes fixed. A third reader added later is
   * covered on the day it is written -- which is the whole lesson of the one-name deny-list that
   * guarded tenant seeding.
   */
  const routes = execFileSync("git", ["ls-files", "app"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith("route.ts"))

  /**
   * ⚠ KEYED ON THE DISCLOSURE SHAPE, NOT ON THE IDENTIFIER APPEARING SOMEWHERE IN THE FILE.
   *
   * The first version of this scan tested `/bankAccount|bankIfsc/` over the whole source and
   * produced three false positives, every one of which is correct code:
   *
   *   - attendance/workers/route.ts -- `INSERT ... RETURNING ... bank_account`, which echoes back
   *     the values the caller supplied one line earlier. Returning someone their own input
   *     discloses nothing. Its GET does not select the columns at all.
   *   - import-bulk/route.ts -- `const bankAccount = getField(row, ...)`, a local holding a CSV
   *     cell on the way into an INSERT.
   *   - other-sales/route.ts -- `bankAccount: string | null`, a type declaration.
   *
   * A guard that cries wolf on three correct files is a guard somebody deletes. The real
   * signature of a leak is a response property whose value is read OUT of a database row:
   * `bankAccount: row.bank_account`. That is shape, not identifiers, so a route using `w.` or
   * `r.` or any other alias is still matched.
   */
  const DISCLOSES =
    /(?:bank(?:Account|Ifsc|Name)|phone)\s*:\s*\w+\.(?:bank_(?:account|ifsc|name)|phone)\b/

  /**
   * ⚠ `phone` WAS MISSING FROM THE PATTERN, so `phone: w.phone` -- a disclosure of a protected
   * field -- passed silently. Raised by CodeRabbit on PR #104, citing this repo's own rule about
   * regexes pinned to the identifiers that happen to be in today's code.
   *
   * KNOWN RESIDUAL, stated rather than papered over: a regex cannot see every disclosure shape.
   * `...row`, `account: row.bank_account`, bracket access and returning a SELECT result directly
   * would all slip past it. That is why the SECOND scan below exists -- it keys on the SQL rather
   * than the response, so a route that selects the columns at all has to justify itself even if
   * it hands them out in a shape this pattern cannot match.
   */
  const SELECTS_WORKER_PII = /SELECT[\s\S]{0,400}?\bbank_(?:account|ifsc)\b[\s\S]{0,200}?FROM\s+attendance_workers/i

  const readers = routes.filter((f) => DISCLOSES.test(stripComments(readFileSync(f, "utf8"))))

  it("finds the routes at all, so this cannot pass by scanning nothing", () => {
    expect(
      readers.length,
      "no route reads worker bank columns -- the scan is broken, not the code",
    ).toBeGreaterThanOrEqual(2)
  })

  /**
   * Routes allowed to disclose without redactWorkerPii, each with a reason.
   *
   * ⚠ THIS USED TO BE `|| /isAdminRole\s*\(/.test(src)`, which any unrelated isAdminRole call
   * anywhere in the file satisfied -- so a route could return `bankAccount: row.bank_account`
   * beside a role check on some other branch and pass. Asserting a mention rather than a call's
   * CONNECTION to the thing it guards is the exact trap this repo documents. Raised by CodeRabbit
   * on PR #104. An exemption now has to be written down here and justified.
   */
  const WHOLESALE_ADMIN_GATED: Record<string, string> = {}

  /**
   * Every region of `src` that is an argument to a redactWorkerPii(...) call.
   *
   * ⚠ THE GATE USED TO BE PER-FILE, AND THAT IS NOT THE PROPERTY. A route that redacted the three
   * bank fields and disclosed `phone` beside them passed, because the file contained the string
   * `redactWorkerPii(` somewhere. Tamper-proven: moving `phone: row.phone` out of the redaction
   * left all eleven tests green. The same per-file looseness let `NOTredactWorkerPii(` satisfy an
   * unanchored pattern -- hence the \b below.
   *
   * So the check is per-OCCURRENCE: every disclosure the pattern finds must sit INSIDE one of
   * these regions. A balanced-paren walk rather than a character window, because a window is what
   * a comment shifts.
   */
  const redactionRegions = (src: string): [number, number][] => {
    const regions: [number, number][] = []
    const call = /\bredactWorkerPii\s*\(/g
    let m: RegExpExecArray | null
    while ((m = call.exec(src))) {
      let i = call.lastIndex
      let depth = 1
      while (i < src.length && depth > 0) {
        if (src[i] === "(") depth++
        else if (src[i] === ")") depth--
        i++
      }
      regions.push([m.index, i])
    }
    return regions
  }

  it.each(readers)("%s redacts every field it discloses, not merely some", (file) => {
    const src = stripComments(readFileSync(file, "utf8"))
    if (file in WHOLESALE_ADMIN_GATED) return

    const regions = redactionRegions(src)
    const global = new RegExp(DISCLOSES.source, "g")
    const leaked: string[] = []
    let m: RegExpExecArray | null
    while ((m = global.exec(src))) {
      const at = m.index
      if (!regions.some(([from, to]) => at > from && at < to)) leaked.push(m[0])
    }

    expect(
      leaked,
      `${file} returns these straight from a database row, outside any redactWorkerPii() call. ` +
        "A file that redacts some protected fields and discloses another is the shape this guard " +
        "missed before: the gate was per-file, and the property is per-field.",
    ).toEqual([])
  })
})

describe("redacting the read must not let a writer blank what they cannot see", () => {
  /**
   * ⚠ THE ONE-SIDED FIX WAS NEARLY SHIPPED, AND IT DESTROYS DATA.
   *
   * The Workers tab renders the Bank column to every role -- it is gated on `canWrite`, not on
   * isAdmin. So once the GET redacts, a writer's edit form loads EMPTY, and the PUT computes
   * `String(body.bankAccount || "").trim() || null`. null !== undefined, so the CASE WHEN fires
   * and writes it. A writer fixing a worker's spelling wipes the account number, silently, and
   * it surfaces when a payout fails weeks later.
   *
   * `undefined` is what every one of those handlers already reads as "leave this column alone".
   */
  it("turns a writer's submitted PII into undefined, not null", () => {
    const out = stripWorkerPiiWrites(
      { phone: "", bankName: "", bankAccount: "", bankIfsc: "", dailyRate: 450 },
      "user",
    ) as Record<string, unknown>
    for (const field of WORKER_PII_FIELDS) {
      expect(out[field], `${field} must be undefined ("leave alone"), never null ("clear it")`).toBeUndefined()
    }
    // Everything a writer IS allowed to edit still goes through.
    expect(out.dailyRate).toBe(450)
  })

  it("lets an admin clear a field on purpose", () => {
    const out = stripWorkerPiiWrites({ bankAccount: null }, "admin") as Record<string, unknown>
    expect(out.bankAccount, "an admin clearing a stale account number must still work").toBeNull()
  })

  it("the worker PUT applies the write gate to every protected field", () => {
    const src = stripComments(readFileSync("app/api/attendance/workers/[id]/route.ts", "utf8"))
    expect(/stripWorkerPiiWrites\s*\(/.test(src)).toBe(true)

    /**
     * ⚠ THIS USED TO ASSERT THE ABSENCE OF ONE STRING -- `const bankAccount = body?.bankAccount`
     * -- and only for bankAccount. A different spelling (`const { bankAccount } = body`, or the
     * body read inline in the SQL template) bypassed the gate and passed, and phone, bank name
     * and IFSC were not checked at all. Raised by CodeRabbit on PR #104.
     *
     * Asserted as a property instead: every protected column's UPDATE must be driven by the
     * variable the destructuring produced, and the raw body must not reach the statement.
     */
    const update = src.slice(src.indexOf("UPDATE attendance_workers"))
    const statement = update.slice(0, update.indexOf("WHERE id ="))
    expect(statement.length, "could not isolate the UPDATE statement").toBeGreaterThan(100)

    const columns = [
      ["phone", "phone"],
      ["bank_name", "bankName"],
      ["bank_account", "bankAccount"],
      ["bank_ifsc", "bankIfsc"],
    ] as const

    for (const [column, variable] of columns) {
      // The column is written from the gated variable...
      expect(
        new RegExp(`${column}\\s*=\\s*CASE WHEN \\$\\{${variable} !== undefined\\}`).test(statement),
        `${column} is not written from the gated ${variable}, so a writer's blank may reach it`,
      ).toBe(true)
      // ...and never straight off the request body.
      expect(
        new RegExp(`${column}[^,]*body\\s*\\??\\.`).test(statement),
        `${column} reads the request body directly inside the UPDATE, bypassing the write gate`,
      ).toBe(false)
    }

    // And the gated names must come from the helper, not be reassigned around it.
    // The CALL, not the import -- src.indexOf("stripWorkerPiiWrites") finds the import line,
    // which is the third time today a scan in this repo matched a mention instead of a call.
    const destructure = src.slice(src.search(/stripWorkerPiiWrites\s*\(/))
    for (const [, variable] of columns) {
      expect(
        src.indexOf(`const ${variable} = body`),
        `${variable} is read straight off the body again -- the write gate has been bypassed`,
      ).toBe(-1)
      expect(destructure.slice(0, 400)).toContain(variable)
    }
  })

})
