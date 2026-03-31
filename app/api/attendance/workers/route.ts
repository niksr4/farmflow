import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
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

    const insertedRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        INSERT INTO attendance_workers (
          tenant_id,
          full_name,
          worker_type,
          daily_rate
        )
        VALUES (
          ${tenantContext.tenantId},
          ${name},
          ${workerType},
          ${dailyRate}
        )
        RETURNING id, full_name, worker_type, daily_rate, created_at
      `,
    )

    const worker = insertedRows[0]

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
            createdAt: worker.created_at ? String(worker.created_at) : null,
          }
        : null,
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }

    const normalizedError = normalizeAttendanceSchemaError(error)
    logServerError("Failed to add attendance worker", normalizedError)
    return NextResponse.json(
      { success: false, error: normalizedError.message },
      { status: normalizedError.message === ATTENDANCE_SCHEMA_HELP ? 503 : 500 },
    )
  }
}
