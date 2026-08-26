import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"
import { assessShift, resolveShiftThresholds } from "@/lib/attendance-hours"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Attendance over a date range: who turned up, how often, and for how long.
 *
 * Distinct from /api/attendance/report, which answers "what happened on one day" and is what the
 * printed daily muster sheet reads. This is the payroll-shaped question -- a period, per worker --
 * and it exists because the only way to ask it before was to open thirty daily reports.
 *
 * HOURS ARE DERIVED HERE, NOT STORED. attendance_records holds check_in_time and check_out_time;
 * whether a given pair is a full day, a half day, or a finger read twice is a judgement made by
 * lib/attendance-hours.ts against the tenant's own thresholds. Keeping it out of SQL means the
 * rule has one implementation shared with the muster and the roll-up, rather than a Postgres
 * expression that agrees with the TypeScript until the day someone edits one of them.
 *
 * ESTATE-SCOPED, unlike payroll. A worker belongs to an estate (scripts/115) and HoneyFarm runs
 * two, so "attendance at Sidapur last week" is a real question. Workers with no estate set serve
 * every estate, the same always-shows rule as everywhere else.
 */
export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)

    const startDate = searchParams.get("startDate") || ""
    const endDate = searchParams.get("endDate") || ""

    if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate are required (YYYY-MM-DD)" },
        { status: 400 },
      )
    }
    if (startDate > endDate) {
      return NextResponse.json({ success: false, error: "startDate must be on or before endDate" }, { status: 400 })
    }

    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateClause = activeEstate
      ? accountsSql` AND (w.estate IS NULL OR w.estate = ${activeEstate})`
      : accountsSql``

    const [rows, thresholdRows] = await runTenantQueries(accountsSql, tenantContext, [
      accountsSql`
        SELECT
          w.id                AS worker_id,
          w.full_name,
          w.worker_type,
          w.estate,
          w.daily_rate,
          r.attendance_date::text                                  AS attendance_date,
          r.check_in_time  AT TIME ZONE 'Asia/Kolkata'             AS check_in,
          r.check_out_time AT TIME ZONE 'Asia/Kolkata'             AS check_out,
          r.source,
          -- What the manager actually allocated that day, which is the number that gets paid.
          -- Shown beside the hours so a disagreement between the two is visible rather than
          -- silently resolved in favour of whichever one the report happened to read.
          COALESCE(a.allocated_fraction, 0)::float                 AS allocated_fraction,
          COALESCE(a.allocated_cost, 0)::float                     AS allocated_cost
        FROM attendance_records r
        JOIN attendance_workers w
          ON w.id = r.worker_id
         AND w.tenant_id = ${tenantContext.tenantId}
        LEFT JOIN LATERAL (
          SELECT SUM(la.day_fraction) AS allocated_fraction, SUM(la.total_cost) AS allocated_cost
          FROM labour_assignments la
          WHERE la.tenant_id = ${tenantContext.tenantId}
            AND la.worker_id = r.worker_id
            AND la.work_date = r.attendance_date
        ) a ON TRUE
        WHERE r.tenant_id = ${tenantContext.tenantId}
          AND r.attendance_date BETWEEN ${startDate}::date AND ${endDate}::date
          ${estateClause}
        ORDER BY LOWER(w.full_name), r.attendance_date
      `,
      accountsSql`
        SELECT full_day_hours, half_day_hours FROM tenants WHERE id = ${tenantContext.tenantId} LIMIT 1
      `,
    ])

    const thresholds = resolveShiftThresholds({
      fullDayHours: Number(thresholdRows?.[0]?.full_day_hours),
      halfDayHours: Number(thresholdRows?.[0]?.half_day_hours),
    })

    type WorkerSummary = {
      workerId: string
      name: string
      workerType: string | null
      estate: string | null
      dailyRate: number | null
      daysPresent: number
      fullDays: number
      halfDays: number
      shortDays: number
      openDays: number
      totalHours: number
      allocatedDays: number
      allocatedCost: number
      /** Present, shift closed, and nothing allocated — the days worth chasing. */
      unallocatedDays: number
      days: Array<{
        date: string
        checkIn: string | null
        checkOut: string | null
        hours: number | null
        status: string
        rescanIgnored: boolean
        allocatedFraction: number
      }>
    }

    const byWorker = new Map<string, WorkerSummary>()

    for (const row of rows as any[]) {
      const id = String(row.worker_id)
      let summary = byWorker.get(id)
      if (!summary) {
        summary = {
          workerId: id,
          name: String(row.full_name),
          workerType: row.worker_type ? String(row.worker_type) : null,
          estate: row.estate ? String(row.estate) : null,
          dailyRate: row.daily_rate === null ? null : Number(row.daily_rate),
          daysPresent: 0, fullDays: 0, halfDays: 0, shortDays: 0, openDays: 0,
          totalHours: 0, allocatedDays: 0, allocatedCost: 0, unallocatedDays: 0,
          days: [],
        }
        byWorker.set(id, summary)
      }

      const shift = assessShift(row.check_in, row.check_out, thresholds)
      const allocatedFraction = Number(row.allocated_fraction) || 0

      summary.daysPresent += 1
      if (shift.status === "full") summary.fullDays += 1
      else if (shift.status === "half") summary.halfDays += 1
      else if (shift.status === "short") summary.shortDays += 1
      else if (shift.status === "open") summary.openDays += 1
      if (shift.hours !== null) summary.totalHours += shift.hours
      summary.allocatedDays += allocatedFraction
      summary.allocatedCost += Number(row.allocated_cost) || 0
      if (allocatedFraction === 0 && shift.status !== "open") summary.unallocatedDays += 1

      summary.days.push({
        date: String(row.attendance_date),
        checkIn: row.check_in ? new Date(row.check_in).toISOString() : null,
        checkOut: row.check_out ? new Date(row.check_out).toISOString() : null,
        hours: shift.hours,
        status: shift.status,
        rescanIgnored: shift.rescanIgnored,
        allocatedFraction,
      })
    }

    const workers = Array.from(byWorker.values())
    const totals = {
      workers: workers.length,
      daysPresent: workers.reduce((s, w) => s + w.daysPresent, 0),
      totalHours: workers.reduce((s, w) => s + w.totalHours, 0),
      allocatedDays: workers.reduce((s, w) => s + w.allocatedDays, 0),
      allocatedCost: workers.reduce((s, w) => s + w.allocatedCost, 0),
      unallocatedDays: workers.reduce((s, w) => s + w.unallocatedDays, 0),
      openDays: workers.reduce((s, w) => s + w.openDays, 0),
    }

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      estate: activeEstate,
      thresholds,
      workers,
      totals,
    })
  } catch (error) {
    // Returns before logging: a module being switched off is a configuration answer, not a fault,
    // and logging it first is what turned a legitimate 403 into noise on two admin routes.
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to build the attendance summary", error)
    return NextResponse.json({ success: false, error: "Failed to build the attendance summary" }, { status: 500 })
  }
}
