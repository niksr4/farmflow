import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { isLocationAccessError } from "@/lib/server/location-access"
import { validateLocationForTenant } from "@/lib/server/location-utils"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { reconcileUnmappedPunches } from "@/lib/server/biometric-attendance"
import {
  ATTENDANCE_MAX_WORKER_NAME_LENGTH,
  ATTENDANCE_SCHEMA_HELP,
  normalizeAttendanceSchemaError,
  normalizeAttendanceWorkerName,
} from "@/lib/attendance"
import { logServerError } from "@/lib/server/safe-logging"

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const name = normalizeAttendanceWorkerName(body?.name)
    if (!name) {
      return NextResponse.json({ success: false, error: "Employee name is required" }, { status: 400 })
    }
    if (name.length > ATTENDANCE_MAX_WORKER_NAME_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Employee name must be ${ATTENDANCE_MAX_WORKER_NAME_LENGTH} characters or less` },
        { status: 400 },
      )
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const existingRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id
        FROM attendance_workers
        WHERE tenant_id = ${tenantContext.tenantId}
          AND active = TRUE
          AND LOWER(full_name) = LOWER(${name})
        LIMIT 1
      `,
    )
    if (existingRows.length > 0) {
      return NextResponse.json({ success: false, error: "Employee already exists" }, { status: 409 })
    }

    const workerType = ["permanent", "seasonal", "contractor"].includes(String(body?.workerType || ""))
      ? String(body.workerType)
      : null
    const dailyRate = body?.dailyRate != null && !Number.isNaN(Number(body.dailyRate)) ? Number(body.dailyRate) : null

    const requestedLocationId = body?.locationId ? String(body.locationId).trim() : null
    const locationId = await validateLocationForTenant(accountsSql, tenantContext, sessionUser, requestedLocationId)
    if (requestedLocationId && !locationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }

    // The fingerprint terminal's enrol ID for this worker. Settable at creation so an estate can
    // map people up front rather than only after an unrecognised code has already punched --
    // previously the ONLY route to this column was the unmapped-codes panel, which appears after
    // the fact. Same 30-char cap as the PATCH handler.
    const deviceUserCode = String(body?.deviceUserCode || "").trim().slice(0, 30) || null

    const insertedRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        INSERT INTO attendance_workers (
          tenant_id,
          full_name,
          worker_type,
          daily_rate,
          location_id,
          device_user_code
        )
        VALUES (
          ${tenantContext.tenantId},
          ${name},
          ${workerType},
          ${dailyRate},
          ${locationId},
          ${deviceUserCode}
        )
        RETURNING id, full_name, worker_type, daily_rate, location_id, device_user_code, created_at
      `,
    )

    const worker = insertedRows[0]

    if (deviceUserCode && worker?.id) {
      // Punches can arrive before the worker exists -- an estate typically enrols fingers on the
      // terminal first, so code 7 may already have a week of attendance sitting unmapped by the
      // time someone creates the matching worker. Without this, creating them would only capture
      // future punches and quietly abandon the history. Mirrors the PATCH handler.
      await reconcileUnmappedPunches(accountsSql, tenantContext, deviceUserCode, String(worker.id)).catch((error) => {
        logServerError("Failed to reconcile unmapped biometric punches on worker create", error)
      })
    }

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "attendance_workers",
      entityId: worker?.id ?? null,
      after: worker ?? null,
    })

    return NextResponse.json({
      success: true,
      worker: worker
        ? {
            id: String(worker.id),
            name: String(worker.full_name || ""),
            workerType: worker.worker_type ? String(worker.worker_type) : null,
            dailyRate: worker.daily_rate != null ? Number(worker.daily_rate) : null,
            locationId: worker.location_id ? String(worker.location_id) : null,
            createdAt: worker.created_at ? String(worker.created_at) : null,
          }
        : null,
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (isLocationAccessError(error)) {
      return NextResponse.json({ success: false, error: "You don't have access to this location" }, { status: 403 })
    }

    const normalizedError = normalizeAttendanceSchemaError(error)
    logServerError("Failed to add attendance worker", normalizedError)
    return NextResponse.json(
      { success: false, error: normalizedError.message },
      { status: normalizedError.message === ATTENDANCE_SCHEMA_HELP ? 503 : 500 },
    )
  }
}
