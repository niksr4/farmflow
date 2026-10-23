import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"

/**
 * A BIOMETRIC PUNCH MAY BE DELETED BY EXACTLY ONE ROUTE, AND ONLY WITH A REASON.
 *
 * The muster save path in `app/api/attendance/route.ts` deletes rows a manager unticked, and it
 * restricts that to `check_in_time IS NULL` on purpose. On HoneyFarm's first live scanner day a
 * manager saved the sheet from a tab loaded before Bopaiah punched, so he was missing from the
 * submitted list and his biometric row was deleted by a diff nobody asked for.
 * `tests/punch-survives-the-muster.test.ts` guards that predicate and still does.
 *
 * That left a one-way door: a mis-enrolled finger could create a punch no screen could remove.
 * Saina at HoneyFarm is on October payroll for Rs 988 she did not earn. So there is now a second
 * delete path -- `app/api/attendance/records/[id]` -- which exists only to remove one named row,
 * demands a written reason, and records both in the audit log.
 *
 * ⚠ THE RISK THIS GUARDS IS THE THIRD PATH. Once a deliberate exception exists, the next delete
 * written against this table has a precedent to point at, and the Bopaiah bug comes back wearing
 * different clothes. So: every statement that deletes from `attendance_records` must either carry
 * the `check_in_time IS NULL` predicate, or be the audited endpoint that requires a reason. There
 * is no third option, and this fails if one appears.
 *
 * Derived from the tree rather than a list of two filenames, because a list of two is how the
 * third one hides -- see "Writing a guard that cannot go vacuous" in CLAUDE.md.
 */

const AUDITED_DELETE_ROUTE = "app/api/attendance/records/[id]/route.ts"

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<![:"'\\])\/\/.*$/gm, "")

const collectRouteFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectRouteFiles(full))
    else if (entry === "route.ts") out.push(full)
  }
  return out
}

/** Every route that deletes from the attendance table, whatever it calls its variables. */
const routesDeletingAttendance = () => {
  const root = process.cwd()
  return collectRouteFiles(resolve(root, "app/api"))
    .filter((file) => /DELETE\s+FROM\s+attendance_records\b/i.test(stripComments(readFileSync(file, "utf8"))))
    .map((file) => relative(root, file).split("\\").join("/"))
    .sort()
}

const sourceOf = (relativePath: string) =>
  stripComments(readFileSync(resolve(process.cwd(), relativePath), "utf8"))

/**
 * Import the route with its database and auth edges replaced, so the handler itself runs.
 *
 * ⚠ THIS USED TO HARDCODE role: "admin", so NO EXECUTED TEST EVER SHOWED A WRITER BEING REFUSED --
 * the admin gate was asserted only by a source match on /isAdminRole\s*\(/, which
 * `if (false && !isAdminRole(...))` would satisfy. The role is a parameter now, and the 403 is a
 * real call. Raised on #129's review.
 *
 * ⚠ AND `accountsSql` USED TO RECORD NOTHING, with a comment claiming the text did not matter
 * because a source scan could see it. A scan cannot see whether the DELETE carries its tenant
 * predicate at runtime, and the mock returning `{}` meant "a second statement was issued" passed
 * for any statement at all. It now records the joined SQL and its bound values.
 */
/**
 * A well-formed v4 id. The old fixture was "1111-1111-1111-1111", whose variant nibble is not in
 * [89ab], so it is not a legal UUID at all -- every one of prod's 5,997 attendance_records ids is,
 * and adding the route's validator is what exposed the fixture rather than the other way round.
 */
const VALID_RECORD_ID = "11111111-1111-4111-8111-111111111111"

const loadRouteWithMocks = async (rows: unknown[], role: string = "admin") => {
  vi.resetModules()

  /** Every statement the route issues, as { text, values }, so a dropped predicate is visible. */
  const statements: Array<{ text: string; values: unknown[] }> = []

  const runTenantQuery = vi.fn(async () => rows.splice(0, rows.length))
  /**
   * Typed parameters, not `async () => {}`. An argument-less mock infers `calls: []`, so
   * `calls[0][2]` is a TYPE error rather than a value -- which has already cost one round here.
   */
  const logAuditEvent = vi.fn(async (_client: unknown, _user: unknown, _event: unknown) => {})
  const accountsSql = Object.assign(
    (strings: TemplateStringsArray | string, ...values: unknown[]) => {
      const text = typeof strings === "string" ? strings : strings.join(" ? ")
      statements.push({ text, values })
      return {}
    },
    { query: () => ({}) },
  )

  vi.doMock("@/lib/server/db", () => ({ accountsSql, sql: accountsSql, adminSql: accountsSql }))
  vi.doMock("@/lib/server/tenant-db", () => ({
    runTenantQuery,
    normalizeTenantContext: (tenantId: string, role: string) => ({ tenantId, role }),
  }))
  vi.doMock("@/lib/server/audit-log", () => ({ logAuditEvent }))
  vi.doMock("@/lib/server/module-access", () => ({
    requireModuleAccess: async () => ({
      id: "user-1",
      username: "adminna",
      role,
      tenantId: "tenant-1",
    }),
    isModuleAccessError: () => false,
  }))

  const route = await import("@/app/api/attendance/records/[id]/route")
  return { runTenantQuery, logAuditEvent, statements, deleteHandler: route.DELETE }
}

describe("a punch can only be removed on purpose", () => {
  it("finds the routes that delete attendance at all", () => {
    // Vacuity: a renamed table or a moved app/api would leave every assertion below inspecting
    // nothing, which reads exactly like a clean run.
    const routes = routesDeletingAttendance()
    expect(routes.length).toBeGreaterThanOrEqual(2)
    expect(routes).toContain("app/api/attendance/route.ts")
    expect(routes).toContain(AUDITED_DELETE_ROUTE)
  })

  it("every delete either spares punches or is the audited single-record one", () => {
    const offenders = routesDeletingAttendance().filter((route) => {
      if (route === AUDITED_DELETE_ROUTE) return false
      return !/check_in_time\s+IS\s+NULL/i.test(sourceOf(route))
    })

    expect(
      offenders,
      `These routes delete from attendance_records without the check_in_time IS NULL predicate ` +
        `that keeps a biometric punch out of a muster diff. If a new path genuinely needs to remove ` +
        `a punch, it must demand a reason and write an audit row, like ${AUDITED_DELETE_ROUTE}.`,
    ).toEqual([])
  })

  /**
   * ⚠ THIS IS EXECUTED, NOT GREPPED, AND THE FIRST VERSION WAS GREPPED AND VACUOUS.
   *
   * It asserted that `body?.reason`, `MIN_REASON_LENGTH` and `status: 400` appeared in the file.
   * Replacing the whole check with `if (false) {` left every one of those strings exactly where it
   * was, so the guard passed over a dead branch and a reasonless delete would have succeeded.
   * Caught by tamper-testing, which is the only thing that can see it.
   *
   * A source scan cannot distinguish live code from text. Where a behaviour can be run, run it.
   */
  it("the audited route refuses to act without a reason", async () => {
    const { runTenantQuery, deleteHandler } = await loadRouteWithMocks([{ id: "rec-1" }])

    const refused = await deleteHandler(
      new Request("http://localhost/api/attendance/records/rec-1", {
        method: "DELETE",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: VALID_RECORD_ID }) },
    )

    expect(refused.status).toBe(400)
    // And nothing was touched. A route that refused AFTER deleting would still answer 400.
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("the audited route deletes and audits when a reason is given", async () => {
    const { runTenantQuery, logAuditEvent, statements, deleteHandler } = await loadRouteWithMocks([
      {
        id: "rec-1",
        worker_id: "w-1",
        attendance_date: "2026-10-13",
        source: "biometric",
        full_name: "Saina",
        check_in_clock: "08:01",
        check_out_clock: "16:48",
      },
    ])

    const accepted = await deleteHandler(
      new Request("http://localhost/api/attendance/records/rec-1", {
        method: "DELETE",
        body: JSON.stringify({ reason: "Mis-enrolled finger, device code 31" }),
      }),
      { params: Promise.resolve({ id: VALID_RECORD_ID }) },
    )

    expect(accepted.status).toBe(200)

    /**
     * ⚠ THIS USED TO BE `calls.length >= 2` AND WOULD HAVE PASSED WITH NO DELETE AT ALL.
     * runTenantQuery returns whatever it is handed and accountsSql was a no-op, so "a second
     * statement was issued" was satisfied by any statement whatsoever -- a change that dropped
     * the tenant predicate, or deleted nothing, would not have failed it. Assert the statement.
     */
    const deleteStatement = statements.find((entry) => /DELETE\s+FROM\s+attendance_records/i.test(entry.text))
    expect(deleteStatement, `no DELETE issued; statements were: ${statements.map((e) => e.text.slice(0, 60)).join(" | ")}`).toBeTruthy()
    // Tenant-scoped, and scoped to the one row. Either predicate missing is a cross-tenant delete.
    expect(deleteStatement!.text).toMatch(/tenant_id/i)
    expect(deleteStatement!.values).toContain("tenant-1")
    expect(deleteStatement!.values).toContain(VALID_RECORD_ID)

    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    const event = logAuditEvent.mock.calls[0][2] as any
    expect(event.action).toBe("delete")
    expect(event.entityType).toBe("attendance_records")
    // The reason is the only trace left once the row is gone.
    expect(event.after.reason).toBe("Mis-enrolled finger, device code 31")
    expect(event.before.workerName).toBe("Saina")
    expect(event.before.checkInClock).toBe("08:01")
  })

  /**
   * THE EXECUTED HALF OF THE ADMIN GATE.
   *
   * The source scan below asserts `isAdminRole` appears. That is satisfied by dead code --
   * `if (false && !isAdminRole(...))` matches it -- and until #129's review NO test ever sent a
   * writer through this route. This one does, and it is the assertion that would actually have
   * caught the original `canDeleteModule` bug.
   */
  it("refuses a writer with 403, and touches nothing", async () => {
    const { runTenantQuery, logAuditEvent, statements, deleteHandler } = await loadRouteWithMocks(
      [{ id: VALID_RECORD_ID }],
      "user",
    )

    const refused = await deleteHandler(
      new Request("http://localhost/api/attendance/records/x", {
        method: "DELETE",
        body: JSON.stringify({ reason: "Mis-enrolled finger, device code 31" }),
      }),
      { params: Promise.resolve({ id: VALID_RECORD_ID }) },
    )

    expect(refused.status).toBe(403)
    // A refusal that still deleted, or still audited, would answer 403 just the same.
    expect(runTenantQuery).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(statements).toEqual([])
  })

  it("rejects a non-string reason, which String() would have turned into fifteen characters", async () => {
    const { runTenantQuery, deleteHandler } = await loadRouteWithMocks([{ id: VALID_RECORD_ID }])

    const refused = await deleteHandler(
      new Request("http://localhost/api/attendance/records/x", {
        method: "DELETE",
        // String({}) is "[object Object]" -- 15 characters, past the 4-character minimum, and it
        // would have been stored as the only surviving explanation for a pay change.
        body: JSON.stringify({ reason: {} }),
      }),
      { params: Promise.resolve({ id: VALID_RECORD_ID }) },
    )

    expect(refused.status).toBe(400)
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("the audited route is admin-gated and writes an audit row carrying the reason", () => {
    const src = sourceOf(AUDITED_DELETE_ROUTE)

    /**
     * ⚠ `isAdminRole`, AND NEITHER MODULE HELPER. THIS ASSERTION USED TO BE BACKWARDS.
     *
     * It required `canDeleteModule` and forbade `canWriteModule`, on the reading that delete is the
     * stricter of the two. For module `accounts` THE TWO FUNCTIONS HAVE IDENTICAL BODIES --
     * `accounts` is in `USER_MUTATION_MODULES`, so both return true for a writer. So the route was
     * reachable by any `user`, the PR described it as admin-gated, and the tamper that swapped
     * delete for write was caught by a string match rather than by any behaviour.
     *
     * Found by mounting the screen and checking a writer saw no control, which a source scan
     * structurally cannot do: both spellings look equally correct in the text.
     */
    expect(src).toMatch(/isAdminRole\s*\(/)
    expect(src).not.toMatch(/canDeleteModule\s*\(/)
    expect(src).not.toMatch(/canWriteModule\s*\(/)

    // A call, not an import line.
    expect(src).toMatch(/logAuditEvent\s*\(/)
    // The reason has to reach the audit row. Deleting the record is the only trace left.
    expect(src).toMatch(/after:\s*\{[^}]*reason/)
  })

  it("renders the punch times as IST strings rather than handing back instants", () => {
    const src = sourceOf(AUDITED_DELETE_ROUTE)
    /**
     * Every server here is UTC and the reader is at the estate. A Date would render in the
     * viewer's zone -- the bug that showed an 08:01 punch as 04:31 on a phone in Africa.
     */
    expect(src).toMatch(/to_char\([\s\S]{0,80}AT TIME ZONE 'Asia\/Kolkata'/)
    expect(src).toMatch(/check_in_clock/)
  })
})
