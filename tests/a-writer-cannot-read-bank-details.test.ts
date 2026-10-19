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
  const DISCLOSES = /bank(?:Account|Ifsc|Name)\s*:\s*\w+\.bank_(?:account|ifsc|name)/

  const readers = routes.filter((f) => DISCLOSES.test(stripComments(readFileSync(f, "utf8"))))

  it("finds the routes at all, so this cannot pass by scanning nothing", () => {
    expect(
      readers.length,
      "no route reads worker bank columns -- the scan is broken, not the code",
    ).toBeGreaterThanOrEqual(2)
  })

  it.each(readers)("%s passes bank details through a role gate", (file) => {
    const src = stripComments(readFileSync(file, "utf8"))
    const gated = /redactWorkerPii\s*\(/.test(src) || /isAdminRole\s*\(/.test(src)
    expect(
      gated,
      `${file} returns bankAccount/bankIfsc without calling redactWorkerPii() or isAdminRole(). ` +
        "A role=user writer can read every worker's account number.",
    ).toBe(true)
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

  it("the worker PUT routes the writer's edit form posts to apply the write gate", () => {
    const src = stripComments(readFileSync("app/api/attendance/workers/[id]/route.ts", "utf8"))
    expect(/stripWorkerPiiWrites\s*\(/.test(src)).toBe(true)
    // And the raw body values must not reach the UPDATE directly, bypassing the gate.
    expect(
      /const bankAccount = body\?\.bankAccount/.test(src),
      "bankAccount is read straight off the body again -- the write gate has been bypassed",
    ).toBe(false)
  })
})
