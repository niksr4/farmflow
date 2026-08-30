import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import {
  ATTENDANCE_SCHEMA_ERROR_HELP,
  HEARTBEAT_STALE_AFTER_MS,
  isValidSerialNumber,
  normalizeBiometricSchemaError,
  normalizeSerialNumber,
} from "@/lib/biometric-attendance"
import { logServerError } from "@/lib/server/safe-logging"

const toDeviceResponse = (row: any) => {
  const lastSeenAt = row.last_seen_at ? String(row.last_seen_at) : null
  const isOnline = lastSeenAt != null && Date.now() - new Date(lastSeenAt).getTime() < HEARTBEAT_STALE_AFTER_MS
  return {
    id: String(row.id),
    label: String(row.label || ""),
    serialNumber: String(row.serial_number || ""),
    active: Boolean(row.active),
    lastSeenAt,
    isOnline,
    createdAt: row.created_at ? String(row.created_at) : null,
    // Which estate the terminal physically stands on. scripts/143 added the column and nothing
    // has ever written it, so every device reads as "serves every estate" -- which is the right
    // default for a single-estate tenant and useless for HoneyFarm's two. Null keeps the
    // always-shows convention the rest of the app uses (lib/estate-filter.ts).
    estate: row.estate ? String(row.estate) : null,
  }
}

export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const rows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id, label, serial_number, active, last_seen_at, created_at, estate
        FROM biometric_devices
        WHERE tenant_id = ${tenantContext.tenantId}
        ORDER BY created_at ASC
      `,
    )

    return NextResponse.json({ success: true, devices: rows.map(toDeviceResponse) })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const normalized = normalizeBiometricSchemaError(error)
    logServerError("Failed to list biometric devices", normalized)
    return NextResponse.json(
      { success: false, error: normalized.message },
      { status: normalized.message === ATTENDANCE_SCHEMA_ERROR_HELP ? 503 : 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const serialNumber = normalizeSerialNumber(body?.serialNumber)
    const label = String(body?.label || "").trim().slice(0, 120)
    // Optional. Empty means the terminal serves every estate, the same always-shows convention
    // workers and locations follow -- which is exactly right for a single-estate tenant.
    const estate = String(body?.estate || "").trim().slice(0, 120) || null

    if (!isValidSerialNumber(serialNumber)) {
      return NextResponse.json(
        { success: false, error: "Serial number must be 1-60 letters, digits, hyphens, or underscores" },
        { status: 400 },
      )
    }
    if (!label) {
      return NextResponse.json({ success: false, error: "Device label is required" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    let insertedRows
    try {
      insertedRows = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          INSERT INTO biometric_devices (tenant_id, serial_number, label, estate)
          VALUES (${tenantContext.tenantId}, ${serialNumber}, ${label}, ${estate})
          RETURNING id, label, serial_number, active, last_seen_at, created_at, estate
        `,
      )
    } catch (error) {
      if (String((error as any)?.code || "") === "23505") {
        return NextResponse.json(
          { success: false, error: "This device serial number is already registered" },
          { status: 409 },
        )
      }
      throw error
    }

    const device = insertedRows[0]

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "biometric_devices",
      entityId: device?.id ?? null,
      after: device ?? null,
    })

    return NextResponse.json({ success: true, device: device ? toDeviceResponse(device) : null })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const normalized = normalizeBiometricSchemaError(error)
    logServerError("Failed to register biometric device", normalized)
    return NextResponse.json(
      { success: false, error: normalized.message },
      { status: normalized.message === ATTENDANCE_SCHEMA_ERROR_HELP ? 503 : 500 },
    )
  }
}
