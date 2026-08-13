import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { accountsSql, isDbConfigured } from "@/lib/server/db"
import { isModuleAccessError, requireModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
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

    // Every other attendance endpoint is estate-aware; this one was not, so selecting an estate
    // in the header and opening the report listed workers from all of them. Workers with no
    // location always show, per the always-NULL-shows convention in lib/estate-filter.ts.
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateClause = activeEstate
      ? accountsSql` AND (w.location_id IS NULL OR w.location_id IN (
          SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}
        ))`
      : accountsSql``

    // LEFT JOIN from the roster, not from attendance: a report whose job is spotting absences
    // has to list the people who did NOT turn up. Filtering by date inside the join condition
    // rather than in WHERE is what keeps absentees in the result.
    //
    // The date defaults to the estate's local today rather than the server's — a report run at
    // 01:00 IST would otherwise show the previous day, because the server clock is UTC.
    const [rows, deviceRows] = (await runTenantQueries(accountsSql, tenantContext, [
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
          -- Presence is "the muster roll has a row for this worker today", not "a terminal saw
          -- them". Estates with no fingerprint reader mark by hand and store no times, so
          -- deriving status from check_in alone reported an entire crew absent on days they had
          -- been marked present.
          (r.id IS NOT NULL) AS marked_present,
          (SELECT report_date FROM target)::text AS report_date
        FROM attendance_workers w
        LEFT JOIN attendance_records r
          ON r.worker_id = w.id
         AND r.tenant_id = w.tenant_id
         AND r.attendance_date = (SELECT report_date FROM target)
        WHERE w.tenant_id = ${sessionUser.tenantId}
          -- Active workers, PLUS anyone who has a record for this date but has since been
          -- removed. Filtering on active alone made past reports change retroactively: a worker
          -- deactivated today vanished from every day they had actually worked, which is wrong
          -- for a record that feeds payroll.
          AND (w.active = TRUE OR r.id IS NOT NULL)
          ${estateClause}
        ORDER BY
          NULLIF(regexp_replace(COALESCE(w.device_user_code, ''), '\\D', '', 'g'), '')::bigint NULLS LAST,
          w.full_name
      `,
      // Device health belongs on this page: an estate reading "0 present" needs to know whether
      // nobody turned up or the terminal simply stopped talking. Those look identical otherwise.
      accountsSql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE last_seen_at IS NOT NULL
              AND last_seen_at > NOW() - INTERVAL '5 minutes'
          )::int AS online
        FROM biometric_devices
        WHERE tenant_id = ${sessionUser.tenantId}
          AND active = TRUE
      `,
    ])) as [Array<{
      device_user_code: string | null
      full_name: string
      check_in: string | null
      check_out: string | null
      marked_present: boolean
      report_date: string
    }>, Array<{ total: number; online: number }>]

    const reportDate = rows[0]?.report_date || requested
    const input: AttendanceReportInput[] = rows.map((row) => ({
      employeeCode: row.device_user_code,
      employeeName: row.full_name,
      checkIn: row.check_in,
      checkOut: row.check_out,
      markedPresent: Boolean(row.marked_present),
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
      devices: Number(deviceRows?.[0]?.total ?? 0) > 0
        ? {
            total: Number(deviceRows[0].total),
            online: Number(deviceRows[0].online),
            offline: Number(deviceRows[0].total) - Number(deviceRows[0].online),
          }
        : null,
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
