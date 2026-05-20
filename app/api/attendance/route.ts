import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import {
  ATTENDANCE_SCHEMA_HELP,
  getAttendanceWeekWindow,
  getTodayAttendanceDate,
  normalizeAttendanceDate,
  normalizeAttendanceSchemaError,
} from "@/lib/attendance"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"
export const revalidate = 0

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const normalizeWorkerIds = (value: unknown) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry || "").trim())
        .filter((entry) => UUID_PATTERN.test(entry)),
    ),
  )

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const date = normalizeAttendanceDate(searchParams.get("date"), getTodayAttendanceDate())
    const { startDate, endDate } = getAttendanceWeekWindow(date)

    const [workersRows, presentRows, weeklyRows] = await runTenantQueries(accountsSql, tenantContext, [
      accountsSql`
        SELECT id, full_name, daily_rate, created_at
        FROM attendance_workers
        WHERE tenant_id = ${tenantContext.tenantId}
          AND active = TRUE
        ORDER BY LOWER(full_name), created_at ASC
      `,
      accountsSql`
        SELECT worker_id
        FROM attendance_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND attendance_date = ${date}
      `,
      accountsSql`
        SELECT
          w.id,
          w.full_name,
          COUNT(ar.id)::int AS days_present
        FROM attendance_workers w
        LEFT JOIN attendance_records ar
          ON ar.worker_id = w.id
         AND ar.tenant_id = w.tenant_id
         AND ar.attendance_date BETWEEN ${startDate} AND ${endDate}
        WHERE w.tenant_id = ${tenantContext.tenantId}
          AND w.active = TRUE
        GROUP BY w.id, w.full_name, w.created_at
        ORDER BY LOWER(w.full_name), w.created_at ASC
      `,
    ])

    return NextResponse.json({
      success: true,
      date,
      weekStartDate: startDate,
      weekEndDate: endDate,
      workers: workersRows.map((row: any) => ({
        id: String(row.id),
        name: String(row.full_name || ""),
        dailyRate: row.daily_rate != null ? Number(row.daily_rate) : null,
      })),
      presentWorkerIds: presentRows.map((row: any) => String(row.worker_id)).filter(Boolean),
      weeklySummary: weeklyRows.map((row: any) => ({
        workerId: String(row.id),
        name: String(row.full_name || ""),
        daysPresent: Number(row.days_present) || 0,
      })),
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }

    const normalizedError = normalizeAttendanceSchemaError(error)
    logServerError("Failed to load attendance snapshot", normalizedError)
    return NextResponse.json(
      { success: false, error: normalizedError.message },
      { status: normalizedError.message === ATTENDANCE_SCHEMA_HELP ? 503 : 500 },
    )
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const date = normalizeAttendanceDate(body?.date, "")
    if (!date) {
      return NextResponse.json({ success: false, error: "Valid attendance date is required" }, { status: 400 })
    }

    const presentWorkerIds = normalizeWorkerIds(body?.presentWorkerIds)
    if (Array.isArray(body?.presentWorkerIds) && presentWorkerIds.length !== body.presentWorkerIds.length) {
      return NextResponse.json({ success: false, error: "One or more worker IDs are invalid" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    if (presentWorkerIds.length > 0) {
      const validWorkerRows = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT id
          FROM attendance_workers
          WHERE tenant_id = ${tenantContext.tenantId}
            AND active = TRUE
            AND id = ANY(${presentWorkerIds})
        `,
      )
      if (validWorkerRows.length !== presentWorkerIds.length) {
        return NextResponse.json({ success: false, error: "One or more workers are invalid for this tenant" }, { status: 400 })
      }
    }

    const attendanceQueries = [
      accountsSql`
        DELETE FROM attendance_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND attendance_date = ${date}
      `,
    ]

    if (presentWorkerIds.length > 0) {
      attendanceQueries.push(accountsSql`
        INSERT INTO attendance_records (
          tenant_id,
          worker_id,
          attendance_date,
          marked_by
        )
        SELECT
          ${tenantContext.tenantId},
          w.id,
          ${date},
          ${sessionUser.username || "system"}
        FROM attendance_workers w
        WHERE w.tenant_id = ${tenantContext.tenantId}
          AND w.active = TRUE
          AND w.id = ANY(${presentWorkerIds})
      `)
    }

    await runTenantQueries(accountsSql, tenantContext, attendanceQueries)

    await logAuditEvent(accountsSql, sessionUser, {
      action: "upsert",
      entityType: "attendance_records",
      entityId: date,
      after: {
        date,
        presentWorkerIds,
      },
    })

    return NextResponse.json({
      success: true,
      date,
      presentCount: presentWorkerIds.length,
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }

    const normalizedError = normalizeAttendanceSchemaError(error)
    logServerError("Failed to save attendance", normalizedError)
    return NextResponse.json(
      { success: false, error: normalizedError.message },
      { status: normalizedError.message === ATTENDANCE_SCHEMA_HELP ? 503 : 500 },
    )
  }
}
