import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule, canDeleteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { normalizeAttendanceWorkerName, normalizeAttendanceSchemaError, ATTENDANCE_SCHEMA_HELP } from "@/lib/attendance"
import { logServerError } from "@/lib/server/safe-logging"

const VALID_WORKER_TYPES = ["permanent", "seasonal", "contractor"] as const

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const rows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id, full_name, worker_type, phone, daily_rate, bank_name, bank_account, bank_ifsc, active, created_at
        FROM attendance_workers
        WHERE id = ${id}::uuid
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!rows.length) {
      return NextResponse.json({ success: false, error: "Worker not found" }, { status: 404 })
    }

    const w = rows[0] as any
    return NextResponse.json({
      success: true,
      worker: {
        id: String(w.id),
        name: String(w.full_name || ""),
        workerType: w.worker_type ? String(w.worker_type) : null,
        phone: w.phone ? String(w.phone) : null,
        dailyRate: w.daily_rate != null ? Number(w.daily_rate) : null,
        bankName: w.bank_name ? String(w.bank_name) : null,
        bankAccount: w.bank_account ? String(w.bank_account) : null,
        bankIfsc: w.bank_ifsc ? String(w.bank_ifsc) : null,
        active: Boolean(w.active),
        createdAt: w.created_at ? String(w.created_at) : null,
      },
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const normalized = normalizeAttendanceSchemaError(error)
    logServerError("Failed to fetch worker profile", normalized)
    return NextResponse.json({ success: false, error: normalized.message }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json().catch(() => ({}))

    const existing = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id, full_name, worker_type, phone, daily_rate, bank_name, bank_account, bank_ifsc, active
        FROM attendance_workers
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!existing.length) {
      return NextResponse.json({ success: false, error: "Worker not found" }, { status: 404 })
    }

    const name = body?.name != null ? normalizeAttendanceWorkerName(body.name) : null
    if (name !== null && !name) {
      return NextResponse.json({ success: false, error: "Employee name cannot be empty" }, { status: 400 })
    }

    const workerType =
      body?.workerType != null
        ? VALID_WORKER_TYPES.includes(body.workerType)
          ? String(body.workerType)
          : null
        : undefined
    const phone = body?.phone != null ? String(body.phone || "").trim().slice(0, 30) || null : undefined
    const dailyRate =
      body?.dailyRate != null
        ? !Number.isNaN(Number(body.dailyRate)) && Number(body.dailyRate) >= 0
          ? Number(body.dailyRate)
          : null
        : undefined
    const bankName = body?.bankName != null ? String(body.bankName || "").trim().slice(0, 120) || null : undefined
    const bankAccount = body?.bankAccount != null ? String(body.bankAccount || "").trim().slice(0, 60) || null : undefined
    const bankIfsc = body?.bankIfsc != null ? String(body.bankIfsc || "").trim().slice(0, 20) || null : undefined

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        UPDATE attendance_workers
        SET
          full_name    = COALESCE(${name}, full_name),
          worker_type  = CASE WHEN ${workerType !== undefined} THEN ${workerType ?? null} ELSE worker_type END,
          phone        = CASE WHEN ${phone !== undefined} THEN ${phone ?? null} ELSE phone END,
          daily_rate   = CASE WHEN ${dailyRate !== undefined} THEN ${dailyRate ?? null} ELSE daily_rate END,
          bank_name    = CASE WHEN ${bankName !== undefined} THEN ${bankName ?? null} ELSE bank_name END,
          bank_account = CASE WHEN ${bankAccount !== undefined} THEN ${bankAccount ?? null} ELSE bank_account END,
          bank_ifsc    = CASE WHEN ${bankIfsc !== undefined} THEN ${bankIfsc ?? null} ELSE bank_ifsc END
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "attendance_workers",
      entityId: id,
      before: { ...(existing[0] as any), bank_account: "[redacted]", bank_ifsc: "[redacted]", phone: "[redacted]" },
      after: { name, workerType, dailyRate, bankName, bankAccount: "[redacted]", bankIfsc: "[redacted]", phone: "[redacted]" },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const normalized = normalizeAttendanceSchemaError(error)
    logServerError("Failed to update worker profile", normalized)
    return NextResponse.json(
      { success: false, error: normalized.message },
      { status: normalized.message === ATTENDANCE_SCHEMA_HELP ? 503 : 500 },
    )
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    if (!canDeleteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const existing = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id, full_name FROM attendance_workers
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!existing.length) {
      return NextResponse.json({ success: false, error: "Worker not found" }, { status: 404 })
    }

    // Soft-delete: set active = false so historical records are preserved
    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        UPDATE attendance_workers
        SET active = FALSE
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "attendance_workers",
      entityId: id,
      before: existing[0] as any,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const normalized = normalizeAttendanceSchemaError(error)
    logServerError("Failed to deactivate worker", normalized)
    return NextResponse.json({ success: false, error: normalized.message }, { status: 500 })
  }
}
