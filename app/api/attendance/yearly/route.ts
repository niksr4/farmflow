import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { accountsSql, isDbConfigured } from "@/lib/server/db"
import { isModuleAccessError, requireModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { logServerError } from "@/lib/server/safe-logging"
import { databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { MONTH_PATTERN } from "@/lib/attendance-monthly"
import {
  buildYearlyAttendance,
  monthsBetween,
  summariseYearlyAttendance,
  yearlyAttendanceToCsv,
  type YearlyAttendanceInput,
} from "@/lib/attendance-yearly"
import { ATTENDANCE_SCHEMA_ERROR_HELP, isMissingBiometricSchemaError } from "@/lib/biometric-attendance"

/**
 * The yearly summary — a month per line per worker, the sheet the estate office files.
 *
 * Third sibling of ../monthly (the day-by-day grid) and ../report (who is here today). All three
 * read the SAME roster under the SAME rules — active workers plus anyone with a record in the
 * period, estate-scoped, unassigned workers always visible — and the query below is deliberately
 * the monthly one widened to a range rather than a new one. Three reports that disagree about who
 * is on the roster would be worse than having one.
 *
 * The arithmetic is entirely in lib/attendance-yearly.ts, which in turn runs the monthly builder
 * per month. This file fetches rows and nothing else.
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    if (!isDbConfigured) return databaseNotConfiguredResponse()

    const sessionUser = await requireModuleAccess("labor")
    const { searchParams } = new URL(request.url)
    const format = String(searchParams.get("format") || "json").toLowerCase()

    // The estate's calendar, not the server's. A report opened at 01:00 IST on the 1st would
    // otherwise still be building last month, because the server clock is UTC.
    const istNow = new Date(Date.now() + 5.5 * 3600_000)
    const todayIst = istNow.toISOString().slice(0, 10)
    const thisMonth = todayIst.slice(0, 7)

    const requestedFrom = String(searchParams.get("from") || "").trim()
    const requestedTo = String(searchParams.get("to") || "").trim()
    for (const [name, value] of [["from", requestedFrom], ["to", requestedTo]] as const) {
      if (value && !MONTH_PATTERN.test(value)) {
        return NextResponse.json({ success: false, error: `${name} must be YYYY-MM` }, { status: 400 })
      }
    }

    // Default: January of the current year to now, which is what the printed report shows.
    const from = requestedFrom || `${thisMonth.slice(0, 4)}-01`
    const to = requestedTo || thisMonth

    const months = monthsBetween(from, to)
    if (months.length === 0) {
      return NextResponse.json(
        { success: false, error: "Pick a start month on or before the end month, at most 24 months apart" },
        { status: 400 },
      )
    }

    const firstDay = `${months[0]}-01`
    // The last day of the final month, worked out by stepping back from the first of the next.
    const [lastYear, lastMonth] = months[months.length - 1].split("-").map(Number)
    const lastDay = new Date(Date.UTC(lastYear, lastMonth, 0)).toISOString().slice(0, 10)

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateClause = activeEstate
      ? accountsSql` AND (w.estate IS NULL OR w.estate = ${activeEstate})`
      : accountsSql``

    const [rows, tenantRows] = (await runTenantQueries(accountsSql, tenantContext, [
      accountsSql`
        WITH roll AS (
          -- The muster roll: a human ticked this worker present. Being marked is what presence
          -- means; first thing in the morning the work has not been shared out yet.
          SELECT worker_id, attendance_date, 1::numeric AS credited
          FROM attendance_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND attendance_date BETWEEN ${firstDay}::date AND ${lastDay}::date
        ),
        allocated AS (
          -- What they were put on. Split across two half-day jobs sums to a full day.
          SELECT worker_id, work_date AS attendance_date, SUM(day_fraction)::numeric AS credited
          FROM labour_assignments
          WHERE tenant_id = ${tenantContext.tenantId}
            AND work_date BETWEEN ${firstDay}::date AND ${lastDay}::date
          GROUP BY worker_id, work_date
        ),
        credited AS (
          -- GREATEST, not a sum: the roll and the allocation describe the SAME day from two sides,
          -- and adding them would credit a marked-and-allocated worker twice.
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
          -- Days before a worker existed are blank, not absences. ::text so the driver hands back
          -- a string rather than a Date parsed at midnight UTC.
          (w.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS on_roster_from,
          /*
           * The last day a worker who has LEFT the roll was seen — null while they are still on it.
           *
           * Days after this are blank rather than absent. Without it, somebody deactivated in March
           * who has a March record appears in a Jan-Sep report and collects an absence for every
           * working day from April on: six months of failures to turn up that nobody could have
           * incurred, and yearly totals that disagree with the monthly ones.
           *
           * It is the last day they were SEEN, not the day they left, because the day they left is
           * not recorded anywhere — attendance_workers carries active and created_at and
           * nothing else. Saying "not on the roll after this" is what the data supports; saying
           * "absent" would be a claim it cannot make.
           */
          CASE WHEN w.active THEN NULL ELSE (
            SELECT GREATEST(
              COALESCE(MAX(ar.attendance_date), '-infinity'::date),
              COALESCE((SELECT MAX(la.work_date) FROM labour_assignments la
                        WHERE la.worker_id = w.id AND la.tenant_id = ${tenantContext.tenantId}), '-infinity'::date)
            )::text
            FROM attendance_records ar
            WHERE ar.worker_id = w.id AND ar.tenant_id = ${tenantContext.tenantId}
          ) END AS on_roster_until,
          COALESCE(
            JSON_OBJECT_AGG(c.attendance_date::text, c.credited)
              FILTER (WHERE c.attendance_date IS NOT NULL),
            '{}'::json
          ) AS credited_by_date,
          /*
           * Hours the terminal actually timed, per day.
           *
           * BOTH punches required. A worker who punched in and never out has an unknown finish,
           * not a zero-hour day — the WHERE below drops those rows entirely rather than storing 0,
           * so they cannot drag an average down. Three of the four live estates mark attendance by
           * hand and produce an empty object here, which is why every hours figure downstream is
           * nullable.
           *
           * A SCALAR SUBQUERY, not a join. Joining attendance_records alongside the credited CTE
           * fans out — every credited day pairs with every timed day for that worker — so both
           * JSON_OBJECT_AGGs would emit each key once per row of the other side. The values happen
           * to be identical so JSON.parse would hide it, which is precisely why it is worth not
           * writing.
           */
          COALESCE((
            SELECT JSON_OBJECT_AGG(
                     h.attendance_date::text,
                     ROUND(EXTRACT(EPOCH FROM (h.check_out_time - h.check_in_time)) / 3600.0, 4)
                   )
            FROM attendance_records h
            WHERE h.worker_id = w.id
              AND h.tenant_id = ${tenantContext.tenantId}
              AND h.attendance_date BETWEEN ${firstDay}::date AND ${lastDay}::date
              AND h.check_in_time IS NOT NULL
              AND h.check_out_time IS NOT NULL
              AND h.check_out_time > h.check_in_time
          ), '{}'::json) AS hours_by_date
        FROM attendance_workers w
        LEFT JOIN credited c ON c.worker_id = w.id
        WHERE w.tenant_id = ${tenantContext.tenantId}
          -- Same rule as the daily and monthly reports: active workers, plus anyone with a record
          -- in the range who has since been removed. Otherwise deactivating someone today
          -- rewrites every past month they worked.
          AND (w.active = TRUE OR c.worker_id IS NOT NULL)
          ${estateClause}
        GROUP BY w.id, w.device_user_code, w.full_name, w.created_at
        ORDER BY
          NULLIF(regexp_replace(COALESCE(w.device_user_code, ''), '\\D', '', 'g'), '')::bigint NULLS LAST,
          w.full_name
      `,
      accountsSql`SELECT name FROM tenants WHERE id = ${tenantContext.tenantId} LIMIT 1`,
    ])) as [
      Array<{
        device_user_code: string | null
        full_name: string
        on_roster_from: string | null
        on_roster_until: string | null
        credited_by_date: Record<string, number | string>
        hours_by_date: Record<string, number | string>
      }>,
      Array<{ name: string | null }>,
    ]

    const input: YearlyAttendanceInput[] = rows.map((row) => ({
      employeeCode: row.device_user_code,
      employeeName: row.full_name,
      creditedByDate: Object.fromEntries(
        Object.entries(row.credited_by_date || {}).map(([iso, value]) => [iso, Number(value) || 0]),
      ),
      hoursByDate: Object.fromEntries(
        Object.entries(row.hours_by_date || {}).map(([iso, value]) => [iso, Number(value) || 0]),
      ),
      onRosterFrom: row.on_roster_from,
      onRosterUntil: row.on_roster_until,
    }))

    const report = buildYearlyAttendance(input, months, todayIst)
    const estateName = activeEstate || String(tenantRows?.[0]?.name || "Estate")

    if (format === "csv") {
      return new NextResponse(yearlyAttendanceToCsv(report, months, estateName), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="attendance-yearly-${months[0]}-to-${months[months.length - 1]}.csv"`,
        },
      })
    }

    return NextResponse.json({
      success: true,
      estateName,
      from: months[0],
      to: months[months.length - 1],
      months,
      workers: report,
      summary: summariseYearlyAttendance(report),
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (isMissingBiometricSchemaError(error)) {
      return NextResponse.json({ success: false, error: ATTENDANCE_SCHEMA_ERROR_HELP }, { status: 503 })
    }
    logServerError("Failed to build the yearly attendance summary", error)
    return NextResponse.json({ success: false, error: "Could not build the report" }, { status: 500 })
  }
}
