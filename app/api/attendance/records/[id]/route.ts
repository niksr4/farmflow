import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { isAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { isMissingAttendanceSchemaError, ATTENDANCE_SCHEMA_HELP } from "@/lib/attendance"
import { logServerError } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH, isRemovableRecordId } from "@/lib/attendance-record-removal"

/**
 * THE ONLY WAY TO REMOVE AN ATTENDANCE ROW A TERMINAL WROTE, and it costs you a reason.
 *
 * ⚠ READ `app/api/attendance/route.ts` AROUND "A PUNCH IS EVIDENCE" BEFORE CHANGING ANY OF THIS.
 * The muster save path deletes only rows with `check_in_time IS NULL`, deliberately: on HoneyFarm's
 * first live scanner day a manager saved the sheet from a tab loaded before Bopaiah punched, and
 * his biometric row was deleted by a diff nobody asked for. That guard is correct and stays.
 *
 * But it left no door at all. A punch could be created by a mis-enrolled finger and then never
 * removed from any screen -- the roll lists active workers only, and the one DELETE refuses rows
 * with a check-in. Saina at HoneyFarm is on October payroll for Rs 988 she did not earn: two
 * punches on 13 and 14 October under device code 31, while Mumtaz on code 35 starts on the 14th,
 * which is what a mis-enrolment looks like. Two more rows have the same shape -- owner test punches
 * on a live tenant, Rs 0 but permanently on September's report.
 *
 * So: a separate, explicit, audited endpoint. Not a loosening of the muster diff. The distinction
 * that matters is INTENT -- the muster path removes rows as a side effect of saving something else,
 * which is why it must never touch evidence; this path exists only to remove one row, names it,
 * and records who said so and why.
 *
 * A REASON IS REQUIRED, and that is not ceremony. The audit row is the only trace left after the
 * record is gone, and "deleted by admin" six weeks later cannot be told apart from a mistake. It
 * also changes a wage: removing a day removes its pay, so the next payroll run will differ and
 * somebody will ask why.
 *
 * Gated on `isAdminRole`. A writer marking the wrong person present can still untick them on the
 * muster, because that row has no check-in -- but a real punch is evidence and only an admin may
 * remove one. See the note at the check itself for why `canDeleteModule` was the wrong gate.
 */

// The thresholds live in lib/attendance-record-removal.ts so the dialog and this route cannot
// disagree about what counts as a reason. See the note there on why two copies drift silently.

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    /**
     * ⚠ `isAdminRole`, NOT `canDeleteModule`. THIS WAS WRONG WHEN FIRST WRITTEN AND THE GUARD
     * COULD NOT SEE IT.
     *
     * `accounts` is in `USER_MUTATION_MODULES` (lib/permissions.ts), so
     * `canDeleteModule("user", "accounts")` returns TRUE -- a writer passed this check. Worse, for
     * any module on that list `canDeleteModule` and `canWriteModule` have identical bodies, so the
     * guard's "someone weakened delete to write" tamper was only ever matching a string.
     *
     * The distinction matters because the whole design rests on it: a writer who ticked the wrong
     * person can still untick them on the muster, since that row has no check-in. A real punch is
     * evidence, and removing one is an admin act.
     */
    if (!isAdminRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    /**
     * ⚠ VALIDATED AFTER THE ROLE CHECK, DELIBERATELY, so an unauthorised caller still gets 403
     * rather than learning which ids are well-formed.
     *
     * The id goes into `${id}::uuid`, so a malformed one raised 22P02 and came back as a 500 --
     * sanitizeRouteError refuses to echo "invalid input syntax", so nothing leaked, but a bad
     * request still got the wrong status.
     */
    if (!isRemovableRecordId(id)) {
      return NextResponse.json({ success: false, error: "Unknown record" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    /**
     * ⚠ `String(body?.reason)` ACCEPTED AN OBJECT. `String({})` is "[object Object]" -- fifteen
     * characters, comfortably past the four-character minimum -- so a client sending `{}` wrote
     * that string into the audit event as the only surviving trace of why a worker's pay changed.
     * The reason must be a string to begin with.
     */
    const rawReason = body?.reason
    if (typeof rawReason !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Say why this record is being removed. It changes what the worker is paid.",
        },
        { status: 400 },
      )
    }
    const reason = rawReason.trim().slice(0, MAX_REASON_LENGTH)
    if (reason.length < MIN_REASON_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: "Say why this record is being removed. It changes what the worker is paid.",
        },
        { status: 400 },
      )
    }

    /**
     * The clock columns come back as IST STRINGS, not instants. Every server this runs on is UTC
     * and the reader is at the estate, so a Date here would render in whatever zone the browser
     * happens to be in -- the bug that showed HoneyFarm's muster as 04:31 to a phone in Africa.
     * See the dates section of CLAUDE.md.
     */
    const existing = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT
          r.id,
          r.worker_id,
          r.attendance_date::text                                             AS attendance_date,
          r.source,
          r.marked_by,
          w.full_name,
          to_char(r.check_in_time  AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')     AS check_in_clock,
          to_char(r.check_out_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')     AS check_out_clock
        FROM attendance_records r
        JOIN attendance_workers w ON w.id = r.worker_id
        WHERE r.id = ${id}::uuid
          AND r.tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!existing.length) {
      return NextResponse.json({ success: false, error: "Attendance record not found" }, { status: 404 })
    }

    const row = existing[0] as any

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        DELETE FROM attendance_records
        WHERE id = ${id}::uuid
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    /**
     * The audit row is the whole record now. `before` carries the punch times as the estate read
     * them, because an instant in a JSON blob is a second chance to get the timezone wrong, and
     * `after` carries the reason -- there is no "after" state otherwise.
     */
    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "attendance_records",
      entityId: String(row.id),
      before: {
        id: String(row.id),
        workerId: String(row.worker_id),
        workerName: String(row.full_name || ""),
        attendanceDate: String(row.attendance_date),
        checkInClock: row.check_in_clock ? String(row.check_in_clock) : null,
        checkOutClock: row.check_out_clock ? String(row.check_out_clock) : null,
        source: row.source ? String(row.source) : null,
        markedBy: row.marked_by ? String(row.marked_by) : null,
      },
      after: { deleted: true, reason },
    })

    return NextResponse.json({
      success: true,
      deleted: {
        workerName: String(row.full_name || ""),
        attendanceDate: String(row.attendance_date),
        checkInClock: row.check_in_clock ? String(row.check_in_clock) : null,
      },
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to delete attendance record", error)
    const isSchemaError = isMissingAttendanceSchemaError(error)
    return NextResponse.json(
      {
        success: false,
        error: isSchemaError
          ? ATTENDANCE_SCHEMA_HELP
          : sanitizeRouteError(error, "Failed to delete attendance record"),
      },
      { status: isSchemaError ? 503 : 500 },
    )
  }
}
