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
          p.device_user_code,
          COUNT(*)::int AS punch_count,
          MIN(p.punched_at) AS first_seen_at,
          MAX(p.punched_at) AS last_seen_at,
          -- The name typed on the terminal when this finger was enrolled. It is the only
          -- human-readable form of a device code, so surfacing it turns "map code 5 to
          -- somebody" into "confirm that code 5 is SUM".
          MAX(e.user_name) AS enrolled_name
        FROM biometric_punches p
        LEFT JOIN biometric_enrollments e
          ON e.tenant_id = p.tenant_id
         AND e.device_user_code = p.device_user_code
        WHERE p.tenant_id = ${tenantContext.tenantId}
          AND p.worker_id IS NULL
        GROUP BY p.device_user_code
        ORDER BY MAX(p.punched_at) DESC
      `,
    )

    return NextResponse.json({
      success: true,
      unmappedCodes: rows.map((row: any) => ({
        deviceUserCode: String(row.device_user_code),
        punchCount: Number(row.punch_count) || 0,
        firstSeenAt: row.first_seen_at ? String(row.first_seen_at) : null,
        lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
        // The query has selected this from the start and the settings panel has always declared
        // and rendered it -- the response simply never carried it, so "Code 5 -- SUM" has only
        // ever displayed as "Code 5". A column fetched and then dropped on the way out fails
        // silently in exactly this way: nothing errors, the screen is just less useful than the
        // code says it is.
        enrolledName: row.enrolled_name ? String(row.enrolled_name) : null,
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
