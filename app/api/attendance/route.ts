import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
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

    // Filters on the worker's OWN estate (script 115), not on the estate of whichever block they
    // happened to be assigned to. A worker belongs to an estate; a deployment happens on a block.
    // Script 112's location_id was only ever a proxy for this, and it asked the wrong question --
    // Medappa's picker offered 21 blocks when the answer was one of 2.
    //
    // Unassigned workers still show under every estate (the always-NULL-shows convention in
    // lib/estate-filter.ts). That is why this switch changes nothing on deploy: script 115
    // backfills estate from the assigned block, and every Medappa worker is unassigned, so they
    // go from "NULL location, shows everywhere" to "NULL estate, shows everywhere".
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateClause = (column = "estate") =>
      activeEstate
        ? accountsSql` AND (${accountsSql.unsafe(column)} IS NULL OR ${accountsSql.unsafe(column)} = ${activeEstate})`
        : accountsSql``

    const [workersRows, presentRows, weeklyRows, deviceRows, estateRows, assignmentRows] = await runTenantQueries(accountsSql, tenantContext, [
      accountsSql`
        SELECT id, full_name, daily_rate, device_user_code, location_id, created_at,
               worker_type, phone, bank_name, bank_account, bank_ifsc,
               -- 'gang' rows carry a headcount instead of a fingerprint: a contract crew is one
               -- line on the muster, not eleven. See scripts/115.
               kind, headcount, estate
        FROM attendance_workers
        WHERE tenant_id = ${tenantContext.tenantId}
          AND active = TRUE
          ${estateClause()}
        ORDER BY LOWER(full_name), created_at ASC
      `,
      accountsSql`
        SELECT worker_id, check_in_time, check_out_time, source
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
          ${estateClause("w.estate")}
        GROUP BY w.id, w.full_name, w.created_at
        ORDER BY LOWER(w.full_name), w.created_at ASC
      `,
      // Existence check only -- drives whether the fingerprint UI appears at all.
      accountsSql`
        SELECT 1
        FROM biometric_devices
        WHERE tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
      // Only genuinely multi-estate tenants need to care that a worker is unassigned; the same
      // convention the estate picker itself uses.
      accountsSql`
        SELECT COUNT(DISTINCT estate)::int AS estate_count
        FROM locations
        WHERE tenant_id = ${tenantContext.tenantId}
          AND estate IS NOT NULL
      `,
      // What each worker actually did today. Scoped by the WORKER's estate, not the assignment's
      // block: a Tirtha-based worker who spent the morning on a Citrus block is still on the
      // Tirtha muster, and hiding that row would show them present with no work against their
      // name. Every worker on this list gets all of their rows.
      accountsSql`
        SELECT a.id, a.worker_id, a.activity_code, a.location_id, a.day_fraction,
               a.rate, a.headcount, a.lump_sum, a.total_cost, a.notes,
               aa.activity AS activity_name,
               COALESCE(l.name, l.code) AS location_name
        FROM labour_assignments a
        JOIN attendance_workers w ON w.id = a.worker_id AND w.tenant_id = a.tenant_id
        LEFT JOIN locations l ON l.id = a.location_id
        LEFT JOIN account_activities aa
          ON aa.code = a.activity_code AND aa.tenant_id = a.tenant_id
        WHERE a.tenant_id = ${tenantContext.tenantId}
          AND a.work_date = ${date}
          ${estateClause("w.estate")}
        ORDER BY LOWER(w.full_name), a.created_at ASC
      `,
    ])

    return NextResponse.json({
      success: true,
      date,
      weekStartDate: startDate,
      weekEndDate: endDate,
      // Estates without a terminal should see no mention of biometrics: the feature is still in
      // validation, and a settings panel for hardware they do not own is noise. The owner always
      // sees it, otherwise registering a tenant's FIRST device is impossible -- no device would
      // mean no UI would mean no way to add one.
      hasBiometricDevices: deviceRows.length > 0 || String(sessionUser.role || "").toLowerCase() === "owner",
      // Unassigned workers show under EVERY estate (the always-NULL-shows convention in
      // lib/estate-filter.ts), so on a multi-estate tenant the selector silently does nothing to
      // the roster. Medappa has 21 locations across two estates and all 24 workers unassigned,
      // which makes a Citrus Grove muster and a Tirtha muster the same list with no hint why.
      isMultiEstate: Number((estateRows?.[0] as any)?.estate_count ?? 0) > 1,
      workers: workersRows.map((row: any) => ({
        id: String(row.id),
        name: String(row.full_name || ""),
        dailyRate: row.daily_rate != null ? Number(row.daily_rate) : null,
        deviceUserCode: row.device_user_code ? String(row.device_user_code) : null,
        locationId: row.location_id ? String(row.location_id) : null,
        // The worker-profiles tab renders Phone and Bank columns and maps them straight off this
        // response. They were never selected here, so those columns were blank for every tenant
        // no matter what was stored, and the add form quietly had nowhere to put the values.
        workerType: row.worker_type ? String(row.worker_type) : null,
        phone: row.phone ? String(row.phone) : null,
        bankName: row.bank_name ? String(row.bank_name) : null,
        bankAccount: row.bank_account ? String(row.bank_account) : null,
        bankIfsc: row.bank_ifsc ? String(row.bank_ifsc) : null,
        kind: row.kind === "gang" ? "gang" : "individual",
        headcount: row.headcount != null ? Number(row.headcount) : null,
        estate: row.estate ? String(row.estate) : null,
      })),
      // One row per job, so a worker who split the day appears more than once. The muster maps
      // these onto workers by workerId; a worker with none is present but unallocated, which is
      // a legitimate state first thing in the morning.
      assignments: assignmentRows.map((row: any) => ({
        id: String(row.id),
        workerId: String(row.worker_id),
        activityCode: String(row.activity_code || ""),
        activityName: row.activity_name ? String(row.activity_name) : null,
        locationId: row.location_id ? String(row.location_id) : null,
        locationName: row.location_name ? String(row.location_name) : null,
        dayFraction: Number(row.day_fraction),
        rate: row.rate != null ? Number(row.rate) : 0,
        headcount: Number(row.headcount) || 1,
        lumpSum: row.lump_sum != null ? Number(row.lump_sum) : null,
        totalCost: row.total_cost != null ? Number(row.total_cost) : 0,
        notes: row.notes ? String(row.notes) : null,
      })),
      presentWorkerIds: presentRows.map((row: any) => String(row.worker_id)).filter(Boolean),
      presentRecords: presentRows.map((row: any) => ({
        workerId: String(row.worker_id),
        checkInTime: row.check_in_time ? String(row.check_in_time) : null,
        checkOutTime: row.check_out_time ? String(row.check_out_time) : null,
        source: row.source === "biometric" ? "biometric" : "manual",
      })),
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

    // The muster sheet this save came from was itself estate-filtered (GET above applies the
    // same estateClause), so presentWorkerIds can only ever contain workers from the active
    // estate -- a worker in a *different* estate can never appear in it, present or not. Without
    // scoping the DELETE below to the same estate, saving Estate A's muster would wipe every
    // other estate's attendance_records for the date, since their worker_ids are (correctly)
    // absent from this estate-scoped presentWorkerIds list.
    const { searchParams } = new URL(request.url)
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateWorkerScopeClause = activeEstate
      ? accountsSql` AND worker_id IN (
          SELECT id FROM attendance_workers w
          WHERE w.tenant_id = ${tenantContext.tenantId}
            AND (w.estate IS NULL OR w.estate = ${activeEstate})
        )`
      : accountsSql``

    // Diff, not replace: only remove rows for workers no longer present, and insert new
    // present workers with ON CONFLICT DO NOTHING. A blanket delete-then-reinsert would
    // silently wipe check_in_time/check_out_time/source on any row a biometric device
    // already wrote for this date whenever a manager re-saves the manual muster sheet.
    const attendanceQueries = [
      accountsSql`
        DELETE FROM attendance_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND attendance_date = ${date}
          AND NOT (worker_id = ANY(${presentWorkerIds}))
          ${estateWorkerScopeClause}
      `,
    ]

    if (presentWorkerIds.length > 0) {
      attendanceQueries.push(accountsSql`
        INSERT INTO attendance_records (
          tenant_id,
          worker_id,
          attendance_date,
          marked_by,
          source
        )
        SELECT
          ${tenantContext.tenantId},
          w.id,
          ${date},
          ${sessionUser.username || "system"},
          'manual'
        FROM attendance_workers w
        WHERE w.tenant_id = ${tenantContext.tenantId}
          AND w.active = TRUE
          AND w.id = ANY(${presentWorkerIds})
        ON CONFLICT (tenant_id, worker_id, attendance_date) DO NOTHING
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
