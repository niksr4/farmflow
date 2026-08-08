import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { ATTENDANCE_SCHEMA_ERROR_HELP, normalizeBiometricSchemaError } from "@/lib/biometric-attendance"
import { logServerError } from "@/lib/server/safe-logging"

export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const rows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT
          device_user_code,
          COUNT(*)::int AS punch_count,
          MIN(punched_at) AS first_seen_at,
          MAX(punched_at) AS last_seen_at
        FROM biometric_punches
        WHERE tenant_id = ${tenantContext.tenantId}
          AND worker_id IS NULL
        GROUP BY device_user_code
        ORDER BY MAX(punched_at) DESC
      `,
    )

    return NextResponse.json({
      success: true,
      unmappedCodes: rows.map((row: any) => ({
        deviceUserCode: String(row.device_user_code),
        punchCount: Number(row.punch_count) || 0,
        firstSeenAt: row.first_seen_at ? String(row.first_seen_at) : null,
        lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
      })),
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const normalized = normalizeBiometricSchemaError(error)
    logServerError("Failed to list unmapped biometric codes", normalized)
    return NextResponse.json(
      { success: false, error: normalized.message },
      { status: normalized.message === ATTENDANCE_SCHEMA_ERROR_HELP ? 503 : 500 },
    )
  }
}
