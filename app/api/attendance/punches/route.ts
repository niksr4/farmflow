import { NextResponse, type NextRequest } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { ATTENDANCE_SCHEMA_ERROR_HELP, isMissingBiometricSchemaError } from "@/lib/biometric-attendance"
import { logServerError } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

/**
 * The last punches this tenant's terminals sent.
 *
 * WHY THIS EXISTS. Setting up a terminal is a loop: change a setting on the device, reboot it,
 * put a finger on it, and find out whether anything arrived. Until now the only feedback was an
 * Online badge driven by heartbeats, which goes green as soon as the device can reach the relay
 * -- before a single finger has been read, and while the serial may still be unregistered. So the
 * one question an estate actually has during setup ("did MY finger, just now, land in FarmFlow?")
 * had no answer anywhere in the product, and the answer had to come from someone with database
 * access. That is the whole reason a terminal could not be commissioned without help.
 *
 * Punches are shown whether or not they map to a worker. An unmapped punch is the most useful
 * thing on the screen during setup: it proves the hardware, the network and the serial are all
 * correct, and leaves only the roster link to do.
 */
export const dynamic = "force-dynamic"

const MAX_LIMIT = 50

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const requested = Number(new URL(request.url).searchParams.get("limit"))
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(Math.trunc(requested), MAX_LIMIT) : 20

    const rows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT
          p.id,
          p.device_user_code,
          p.device_serial,
          p.punched_at,
          p.attendance_date::text AS attendance_date,
          p.worker_id,
          w.full_name AS worker_name,
          d.label AS device_label,
          -- The name typed on the terminal at enrolment. For a punch with no worker mapped yet
          -- this is the only human-readable thing about it, and it turns "code 7 punched" into
          -- "SUM punched" during setup.
          e.user_name AS enrolled_name
        FROM biometric_punches p
        LEFT JOIN attendance_workers w
          ON w.id = p.worker_id AND w.tenant_id = p.tenant_id
        -- Joined on the serial, not device_id. device_id is nullable and ON DELETE SET NULL, so a
        -- terminal that was removed and re-registered -- or a punch that arrived before its device
        -- row existed -- loses the link. The serial is on every punch and never changes.
        LEFT JOIN biometric_devices d
          ON d.serial_number = p.device_serial AND d.tenant_id = p.tenant_id
        LEFT JOIN biometric_enrollments e
          ON e.tenant_id = p.tenant_id AND e.device_user_code = p.device_user_code
        WHERE p.tenant_id = ${tenantContext.tenantId}
        ORDER BY p.punched_at DESC
        LIMIT ${limit}
      `,
    )

    return NextResponse.json({
      success: true,
      punches: rows.map((row: any) => ({
        id: String(row.id),
        deviceUserCode: String(row.device_user_code ?? ""),
        deviceSerial: row.device_serial ? String(row.device_serial) : null,
        deviceLabel: row.device_label ? String(row.device_label) : null,
        punchedAt: row.punched_at ? String(row.punched_at) : null,
        attendanceDate: row.attendance_date ? String(row.attendance_date) : null,
        workerId: row.worker_id ? String(row.worker_id) : null,
        workerName: row.worker_name ? String(row.worker_name) : null,
        enrolledName: row.enrolled_name ? String(row.enrolled_name) : null,
      })),
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to list biometric punches", error)
    // The missing-schema case is a fixed string we wrote, so it is safe to hand back and names the
    // migration to run. Everything else goes through sanitizeRouteError, because the raw driver
    // message carries column names, constraints and SQL fragments.
    //
    // Deliberately the boolean predicate, not normalizeBiometricSchemaError's `.message`. That
    // helper special-cases the schema error and returns every OTHER error untouched, so `.message`
    // off it is exactly as raw as off the original -- six sibling routes do that and sit on the
    // known-leak list in tests/raw-error-message-leak-guard.test.ts, which flags the helper on
    // sight for that reason. This route should not join them.
    const isSchemaError = isMissingBiometricSchemaError(error)
    return NextResponse.json(
      {
        success: false,
        error: isSchemaError ? ATTENDANCE_SCHEMA_ERROR_HELP : sanitizeRouteError(error, "Failed to load punches"),
      },
      { status: isSchemaError ? 503 : 500 },
    )
  }
}
