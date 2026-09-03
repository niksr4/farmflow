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
        SELECT id, label, active, estate FROM biometric_devices
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

    /**
     * Which estate the terminal stands on, changeable after the fact.
     *
     * It could be set when registering and never again -- so a terminal put in under the default
     * "serves every estate" was stuck there, and the only way to correct it was a hand-written SQL
     * transaction. That is exactly the intervention the Scanner tab exists to remove, and it is how
     * HoneyFarm's first device had to be moved between tenants on 2026-09-01.
     *
     * Explicit null clears it back to serving every estate; omitting the field leaves it alone. A
     * name is checked against the tenant's own estates because a typo does not fail -- it invents an
     * estate that exists only on this row and matches no worker.
     */
    let estate: string | null | undefined
    if (body?.estate !== undefined) {
      const requested = String(body.estate ?? "").trim().slice(0, 120)
      if (!requested) {
        estate = null
      } else {
        const known = await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`SELECT 1 FROM locations
                      WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${requested} LIMIT 1`,
        )
        if (!known.length) {
          return NextResponse.json(
            { success: false, error: `"${requested}" is not one of your estates` },
            { status: 400 },
          )
        }
        estate = requested
      }
    }

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        UPDATE biometric_devices
        SET
          label  = COALESCE(${label}, label),
          active = CASE WHEN ${active !== undefined} THEN ${active ?? null} ELSE active END,
          -- Not COALESCE: null is a real value here ("serves every estate") and COALESCE would
          -- make clearing it impossible, the same trap the rainfall edit path had.
          estate = CASE WHEN ${estate !== undefined} THEN ${estate ?? null} ELSE estate END
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "biometric_devices",
      entityId: id,
      before: existing[0] as any,
      after: { label, active, estate },
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
