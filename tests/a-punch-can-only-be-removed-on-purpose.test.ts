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
 * `runTenantQuery` answers `rows` for the first call (the lookup) and nothing afterwards, which is
 * enough for both paths. The tagged-template `accountsSql` is a no-op that records nothing -- what
 * matters is WHETHER a statement was issued, not its text, because the text is what a source scan
 * could already see.
 */
const loadRouteWithMocks = async (rows: unknown[]) => {
  vi.resetModules()

  const runTenantQuery = vi.fn(async () => rows.splice(0, rows.length))
  /**
   * Typed parameters, not `async () => {}`. An argument-less mock infers `calls: []`, so
   * `calls[0][2]` is a TYPE error rather than a value -- which has already cost one round here.
   */
  const logAuditEvent = vi.fn(async (_client: unknown, _user: unknown, _event: unknown) => {})
  const accountsSql = Object.assign(() => ({}), { query: () => ({}) })

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
      role: "admin",
      tenantId: "tenant-1",
    }),
    isModuleAccessError: () => false,
  }))

  const route = await import("@/app/api/attendance/records/[id]/route")
  return { runTenantQuery, logAuditEvent, deleteHandler: route.DELETE }
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
      { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) },
    )

    expect(refused.status).toBe(400)
    // And nothing was touched. A route that refused AFTER deleting would still answer 400.
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("the audited route deletes and audits when a reason is given", async () => {
    const { runTenantQuery, logAuditEvent, deleteHandler } = await loadRouteWithMocks([
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
      { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) },
    )

    expect(accepted.status).toBe(200)
    // One read to find the row, one statement to remove it.
    expect(runTenantQuery.mock.calls.length).toBeGreaterThanOrEqual(2)

    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    const event = logAuditEvent.mock.calls[0][2] as any
    expect(event.action).toBe("delete")
    expect(event.entityType).toBe("attendance_records")
    // The reason is the only trace left once the row is gone.
    expect(event.after.reason).toBe("Mis-enrolled finger, device code 31")
    expect(event.before.workerName).toBe("Saina")
    expect(event.before.checkInClock).toBe("08:01")
  })

  it("the audited route is admin-gated and writes an audit row carrying the reason", () => {
    const src = sourceOf(AUDITED_DELETE_ROUTE)

    // canDeleteModule, not canWriteModule: a writer who ticked the wrong person can still untick
    // them on the muster, because that row has no check-in.
    expect(src).toMatch(/canDeleteModule\s*\(/)
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
