import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule, canDeleteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { ATTENDANCE_SCHEMA_ERROR_HELP, normalizeBiometricSchemaError } from "@/lib/biometric-attendance"
import { logServerError } from "@/lib/server/safe-logging"

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
        SELECT id, label, active FROM biometric_devices
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!existing.length) {
      return NextResponse.json({ success: false, error: "Device not found" }, { status: 404 })
    }

    const label = body?.label != null ? String(body.label || "").trim().slice(0, 120) || null : undefined
    if (label !== undefined && !label) {
      return NextResponse.json({ success: false, error: "Device label cannot be empty" }, { status: 400 })
    }
    const active = typeof body?.active === "boolean" ? body.active : undefined

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        UPDATE biometric_devices
        SET
          label  = COALESCE(${label}, label),
          active = CASE WHEN ${active !== undefined} THEN ${active ?? null} ELSE active END
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "biometric_devices",
      entityId: id,
      before: existing[0] as any,
      after: { label, active },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const normalized = normalizeBiometricSchemaError(error)
    logServerError("Failed to update biometric device", normalized)
    return NextResponse.json(
      { success: false, error: normalized.message },
      { status: normalized.message === ATTENDANCE_SCHEMA_ERROR_HELP ? 503 : 500 },
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
        SELECT id, label, serial_number FROM biometric_devices
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!existing.length) {
      return NextResponse.json({ success: false, error: "Device not found" }, { status: 404 })
    }

    // Hard delete is fine here — unlike workers, there's no historical-record dependency on
    // the device row itself (biometric_punches.device_id is ON DELETE SET NULL). Deleting
    // effectively de-registers the serial number until it's registered again.
    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        DELETE FROM biometric_devices
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "biometric_devices",
      entityId: id,
      before: existing[0] as any,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const normalized = normalizeBiometricSchemaError(error)
    logServerError("Failed to remove biometric device", normalized)
    return NextResponse.json({ success: false, error: normalized.message }, { status: 500 })
  }
}
