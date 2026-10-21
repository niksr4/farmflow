import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canDeleteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { isMissingAttendanceSchemaError, ATTENDANCE_SCHEMA_HELP } from "@/lib/attendance"
import { logServerError } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

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
 * Gated on `canDeleteModule`, so a writer cannot reach it. A writer marking the wrong person
 * present can still untick them on the muster, because that row has no check-in.
 */

/** Short enough to type on a phone, long enough that it cannot be a stray keystroke. */
const MIN_REASON_LENGTH = 4
const MAX_REASON_LENGTH = 500

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    if (!canDeleteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const body = await request.json().catch(() => ({}))
    const reason = String(body?.reason ?? "").trim().slice(0, MAX_REASON_LENGTH)
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
