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
  MONTH_PATTERN,
  buildMonthDays,
  buildMonthlyAttendance,
  monthlyAttendanceToCsv,
  summariseMonthlyAttendance,
  type MonthlyAttendanceInput,
} from "@/lib/attendance-monthly"
import { ATTENDANCE_SCHEMA_ERROR_HELP, isMissingBiometricSchemaError } from "@/lib/biometric-attendance"

/**
 * The monthly attendance grid — the sheet the estate office checks wages against.
 *
 * Sibling of ../report, which answers "who is here today". Both read the same roster under the
 * same rules and those rules are deliberately kept identical: active workers PLUS anyone with a
 * record in the period, estate-scoped with unassigned workers always showing. Two reports that
 * disagree about who is on the roster is worse than having one.
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    if (!isDbConfigured) return databaseNotConfiguredResponse()

    const sessionUser = await requireModuleAccess("labor")
    const { searchParams } = new URL(request.url)
    const format = String(searchParams.get("format") || "json").toLowerCase()

    const requested = String(searchParams.get("month") || "").trim()
    if (requested && !MONTH_PATTERN.test(requested)) {
      return NextResponse.json({ success: false, error: "month must be YYYY-MM" }, { status: 400 })
    }

    // The estate's month, not the server's. A report opened at 01:00 IST on the 1st would
    // otherwise still be building last month, because the server clock is UTC.
    const istNow = new Date(Date.now() + 5.5 * 3600_000)
    const todayIst = istNow.toISOString().slice(0, 10)
    const month = requested || todayIst.slice(0, 7)

    const days = buildMonthDays(month)
    if (days.length === 0) {
      return NextResponse.json({ success: false, error: "month must be YYYY-MM" }, { status: 400 })
    }
    const firstDay = days[0].iso
    const lastDay = days[days.length - 1].iso

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateClause = activeEstate
      ? accountsSql` AND (w.estate IS NULL OR w.estate = ${activeEstate})`
      : accountsSql``

    const [rows, tenantRows] = (await runTenantQueries(accountsSql, tenantContext, [
      accountsSql`
        WITH roll AS (
          -- The muster roll: a human ticked this worker present on this day. No allocation
          -- needed -- being marked is what presence means, and first thing in the morning the
          -- work has not been shared out yet.
          SELECT worker_id, attendance_date, 1::numeric AS credited
          FROM attendance_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND attendance_date BETWEEN ${firstDay}::date AND ${lastDay}::date
        ),
        allocated AS (
          -- What they were actually put on. A worker split across two half-day jobs sums to a
          -- full day; one who did a single half-day job sums to 0.5 and shows as HP.
          SELECT worker_id, work_date AS attendance_date, SUM(day_fraction)::numeric AS credited
          FROM labour_assignments
          WHERE tenant_id = ${tenantContext.tenantId}
            AND work_date BETWEEN ${firstDay}::date AND ${lastDay}::date
          GROUP BY worker_id, work_date
        ),
        credited AS (
          -- GREATEST, not a sum: the roll and the allocation describe the SAME day from two
          -- sides, and adding them would pay a marked-and-allocated worker twice. The allocation
          -- wins when it is more precise (a half day), the roll carries the day when nothing has
          -- been allocated yet.
          SELECT
            COALESCE(r.worker_id, a.worker_id)             AS worker_id,
            COALESCE(r.attendance_date, a.attendance_date) AS attendance_date,
            GREATEST(COALESCE(a.credited, 0), CASE WHEN r.worker_id IS NULL THEN 0 ELSE 1 END) AS credited
          FROM roll r
          FULL OUTER JOIN allocated a
            ON a.worker_id = r.worker_id AND a.attendance_date = r.attendance_date
        )
        SELECT
          w.id,
          w.device_user_code,
          w.full_name,
          -- Days before a worker existed are blank, not absences. Cast to text so the driver
          -- hands back a string rather than a Date parsed at midnight UTC.
          (w.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS on_roster_from,
          COALESCE(
            JSON_OBJECT_AGG(c.attendance_date::text, c.credited)
              FILTER (WHERE c.attendance_date IS NOT NULL),
            '{}'::json
          ) AS credited_by_date
        FROM attendance_workers w
        LEFT JOIN credited c ON c.worker_id = w.id
        WHERE w.tenant_id = ${tenantContext.tenantId}
          -- Same rule as the daily report: active workers, plus anyone who has a record in this
          -- month but has since been removed. Otherwise deactivating someone today silently
          -- rewrites every past month they worked, which is wrong for a sheet that feeds payroll.
          AND (w.active = TRUE OR c.worker_id IS NOT NULL)
          ${estateClause}
        GROUP BY w.id, w.device_user_code, w.full_name, w.created_at
        ORDER BY
          NULLIF(regexp_replace(COALESCE(w.device_user_code, ''), '\\D', '', 'g'), '')::bigint NULLS LAST,
          w.full_name
      `,
      // The estate's own name for the sheet's title line. Cosmetic, but this CSV gets printed and
      // filed, and a page headed "Estate" helps nobody find it again.
      accountsSql`SELECT name FROM tenants WHERE id = ${tenantContext.tenantId} LIMIT 1`,
    ])) as [
      Array<{
        device_user_code: string | null
        full_name: string
        on_roster_from: string | null
        credited_by_date: Record<string, number | string>
      }>,
      Array<{ name: string | null }>,
    ]

    const input: MonthlyAttendanceInput[] = rows.map((row) => ({
      employeeCode: row.device_user_code,
      employeeName: row.full_name,
      creditedByDate: Object.fromEntries(
        Object.entries(row.credited_by_date || {}).map(([iso, value]) => [iso, Number(value) || 0]),
      ),
      onRosterFrom: row.on_roster_from,
    }))

    const report = buildMonthlyAttendance(input, days, todayIst)

    if (format === "csv") {
      const estateName = activeEstate || String(tenantRows?.[0]?.name || "Estate")
      return new NextResponse(monthlyAttendanceToCsv(report, days, estateName), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="attendance-${month}.csv"`,
        },
      })
    }

    return NextResponse.json({
      success: true,
      month,
      estate: activeEstate,
      days,
      rows: report,
      summary: summariseMonthlyAttendance(report, days),
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json(
        { success: false, error: "Module access denied" },
        { status: 403 },
      )
    }
    if (isMissingBiometricSchemaError(error)) {
      return NextResponse.json({ success: false, error: ATTENDANCE_SCHEMA_ERROR_HELP }, { status: 503 })
    }
    logServerError("Monthly attendance report failed", error)
    return NextResponse.json({ success: false, error: "Could not build the monthly attendance report" }, { status: 500 })
  }
}
