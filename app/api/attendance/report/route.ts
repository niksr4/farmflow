import { NextResponse } from "next/server"

import { accountsSql, isDbConfigured } from "@/lib/server/db"
import { isModuleAccessError, requireModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"
import { databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import {
  attendanceReportToCsv,
  buildAttendanceReport,
  summariseAttendanceReport,
  type AttendanceReportInput,
} from "@/lib/attendance-report"
import { ATTENDANCE_SCHEMA_ERROR_HELP, isMissingBiometricSchemaError } from "@/lib/biometric-attendance"

export const dynamic = "force-dynamic"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  try {
    if (!isDbConfigured) return databaseNotConfiguredResponse()

    const sessionUser = await requireModuleAccess("labor")
    const { searchParams } = new URL(request.url)

    const requested = String(searchParams.get("date") || "").trim()
    if (requested && !DATE_PATTERN.test(requested)) {
      return NextResponse.json({ success: false, error: "date must be YYYY-MM-DD" }, { status: 400 })
    }
    const format = String(searchParams.get("format") || "json").toLowerCase()

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    // LEFT JOIN from the roster, not from attendance: a report whose job is spotting absences
    // has to list the people who did NOT turn up. Filtering by date inside the join condition
    // rather than in WHERE is what keeps absentees in the result.
    //
    // The date defaults to the estate's local today rather than the server's — a report run at
    // 01:00 IST would otherwise show the previous day, because the server clock is UTC.
    const rows = (await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        WITH target AS (
          SELECT COALESCE(
            NULLIF(${requested}, '')::date,
            (NOW() AT TIME ZONE 'Asia/Kolkata')::date
          ) AS report_date
        )
        SELECT
          w.device_user_code,
          w.full_name,
          to_char(r.check_in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS')  AS check_in,
          to_char(r.check_out_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') AS check_out,
          (SELECT report_date FROM target)::text AS report_date
        FROM attendance_workers w
        LEFT JOIN attendance_records r
          ON r.worker_id = w.id
         AND r.tenant_id = w.tenant_id
         AND r.attendance_date = (SELECT report_date FROM target)
        WHERE w.tenant_id = ${sessionUser.tenantId}
          AND w.active = TRUE
        ORDER BY
          NULLIF(regexp_replace(COALESCE(w.device_user_code, ''), '\\D', '', 'g'), '')::bigint NULLS LAST,
          w.full_name
      `,
    )) as Array<{
      device_user_code: string | null
      full_name: string
      check_in: string | null
      check_out: string | null
      report_date: string
    }>

    const reportDate = rows[0]?.report_date || requested
    const input: AttendanceReportInput[] = rows.map((row) => ({
      employeeCode: row.device_user_code,
      employeeName: row.full_name,
      checkIn: row.check_in,
      checkOut: row.check_out,
    }))

    const report = buildAttendanceReport(input)

    if (format === "csv") {
      return new NextResponse(attendanceReportToCsv(report, reportDate), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="attendance-${reportDate}.csv"`,
        },
      })
    }

    return NextResponse.json({
      success: true,
      reportDate,
      rows: report,
      summary: summariseAttendanceReport(report),
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json(
        { success: false, error: (error as Error).message || "Module access denied" },
        { status: 403 },
      )
    }
    if (isMissingBiometricSchemaError(error)) {
      return NextResponse.json({ success: false, error: ATTENDANCE_SCHEMA_ERROR_HELP }, { status: 503 })
    }
    logServerError("Attendance report failed", error)
    return NextResponse.json({ success: false, error: "Could not build the attendance report" }, { status: 500 })
  }
}
