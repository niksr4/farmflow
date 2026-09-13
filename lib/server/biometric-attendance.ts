import "server-only"

import type { NeonSql } from "@/lib/server/tenant-db"
import { normalizeTenantContext, runTenantQuery, runTenantQueries } from "@/lib/server/tenant-db"
import { BIOMETRIC_DEVICE_TIMEZONE, type ParsedBiometricPunch } from "@/lib/biometric-attendance"

type TenantContext = { tenantId: string; role: string }

export type ResolvedDevice = { tenantId: string; deviceId: string }

/**
 * The one place in the ingest path that legitimately bypasses RLS.
 *
 * A device authenticates with nothing but its serial number, so "which tenant is this?" has to
 * be answered by searching biometric_devices ACROSS tenants — there is no app.tenant_id to scope
 * to until this query returns. The lookup is narrow (serial → id + tenant_id on an active row)
 * and its result is what every later statement is scoped by.
 *
 * Everything downstream of this runs under BIOMETRIC_DEVICE_ROLE, which does NOT bypass the
 * policy. If you find yourself passing OWNER_CONTEXT to anything else in this file, that is the
 * bug — not a convenience.
 */
const OWNER_CONTEXT = normalizeTenantContext(undefined, "owner")

/**
 * Serial → tenant, cached for a few seconds.
 *
 * ⚠ WHY A CACHE AT ALL. The terminals poll every few minutes and ~96% of those requests carry no
 * punches, yet each one paid a cross-tenant lookup before anything else could happen. Devices are
 * registered once and then not touched: production has two rows in biometric_devices, and the
 * answer to "which tenant owns serial X" is the same on every heartbeat for months at a time.
 *
 * ⚠ AND WHY IT IS SHORT. This is the gate that decides which tenant's data a device may write to,
 * so a stale entry is an authorisation decision made on old information. Deactivating a device has
 * to take effect promptly, which is why the window is seconds rather than minutes and why a
 * NEGATIVE result is never cached — an unknown serial must keep being asked about, or a device
 * registered a moment ago would be refused until the entry expired.
 *
 * Per-instance and therefore best-effort: serverless instances come and go, and a cold one simply
 * does the lookup. That is the correct failure mode — it costs a round trip, never correctness.
 */
const DEVICE_CACHE_TTL_MS = 15_000
const deviceCache = new Map<string, { value: ResolvedDevice; expiresAt: number }>()

/** Drop a serial from the cache — call after registering, renaming or deactivating a device. */
export function forgetDeviceSerial(serialNumber: string): void {
  deviceCache.delete(serialNumber)
}

export async function resolveTenantByDeviceSerial(sql: NeonSql, serialNumber: string): Promise<ResolvedDevice | null> {
  const cached = deviceCache.get(serialNumber)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  if (cached) deviceCache.delete(serialNumber)
  return resolveTenantByDeviceSerialUncached(sql, serialNumber)
}

async function resolveTenantByDeviceSerialUncached(sql: NeonSql, serialNumber: string): Promise<ResolvedDevice | null> {
  const rows = await runTenantQuery(
    sql,
    OWNER_CONTEXT,
    sql`
      SELECT id, tenant_id
      FROM biometric_devices
      WHERE serial_number = ${serialNumber}
        AND active = TRUE
      LIMIT 1
    `,
  )
  if (!rows.length) return null
  const resolved = { deviceId: String((rows[0] as any).id), tenantId: String((rows[0] as any).tenant_id) }
  // Only a hit is cached; see the note above on why a miss must not be.
  deviceCache.set(serialNumber, { value: resolved, expiresAt: Date.now() + DEVICE_CACHE_TTL_MS })
  return resolved
}

export async function touchDeviceLastSeen(sql: NeonSql, tenantContext: TenantContext, deviceId: string): Promise<void> {
  await runTenantQuery(
    sql,
    tenantContext,
    sql`
      UPDATE biometric_devices
      SET last_seen_at = NOW()
      WHERE id = ${deviceId}
        AND tenant_id = ${tenantContext.tenantId}
    `,
  )
}

export async function recordPunchesAndUpsertAttendance(
  sql: NeonSql,
  tenantContext: TenantContext,
  deviceId: string,
  deviceSerial: string,
  punches: ParsedBiometricPunch[],
): Promise<{ recorded: number; unmapped: number }> {
  if (!punches.length) return { recorded: 0, unmapped: 0 }

  // Collapse exact repeats inside one push. The dedup index already makes a re-pushed batch
  // harmless, but devices routinely resend a whole buffer after a failed ack, and there is no
  // reason to ship those rows to Postgres twice.
  // NUL separates the two fields because it cannot occur in either, so no pair of distinct punches
  // can collide on a shared key. Written as the ESCAPE \0, never as a literal NUL byte: a raw one
  // makes the whole file binary to grep, ripgrep and git diff, which silently blinds every
  // text-scanning tool pointed at it -- this repository's own greps and its PR review among them.
  const seen = new Set<string>()
  const batch = punches.filter((punch) => {
    const key = `${punch.deviceUserCode}\0${punch.rawDateTime}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const uniqueCodes = Array.from(new Set(batch.map((punch) => punch.deviceUserCode)))
  const workerRows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id, device_user_code
      FROM attendance_workers
      WHERE tenant_id = ${tenantContext.tenantId}
        AND device_user_code = ANY(${uniqueCodes})
    `,
  )
  const workerIdByCode = new Map<string, string>(
    workerRows.map((row: any) => [String(row.device_user_code), String(row.id)]),
  )

  const markedBy = `device:${deviceSerial}`

  // Two set-based statements regardless of batch size. The previous shape built two statements
  // per punch, and runTenantQueries ships the whole array as a single Neon HTTP transaction —
  // a device that buffered punches through a WiFi outage can push thousands of lines at once
  // (MAX_ADMS_BODY_BYTES allows ~6.5k), which meant a >13k-statement request that would time
  // out the function. The device then retries the same batch forever, so the estate silently
  // stops recording attendance exactly when the network has been worst.
  const codes = batch.map((punch) => punch.deviceUserCode)
  const rawDateTimes = batch.map((punch) => punch.rawDateTime)
  const dates = batch.map((punch) => punch.attendanceDate)
  const statuses = batch.map((punch) => punch.status)
  const verifies = batch.map((punch) => punch.verify)

  // worker_id is resolved by LEFT JOIN rather than passed in from JS, so unmapped codes stay
  // NULL without shipping a uuid[] full of nulls through the driver.
  const punchInsert = sql`
    INSERT INTO biometric_punches (
      tenant_id, device_id, device_serial, device_user_code, worker_id,
      punched_at, attendance_date, raw_status, raw_verify
    )
    SELECT
      ${tenantContext.tenantId}, ${deviceId}, ${deviceSerial}, p.device_user_code, w.id,
      (p.raw_date_time::timestamp AT TIME ZONE ${BIOMETRIC_DEVICE_TIMEZONE}),
      p.attendance_date::date, p.raw_status, p.raw_verify
    FROM unnest(
      ${codes}::text[], ${rawDateTimes}::text[], ${dates}::text[],
      ${statuses}::text[], ${verifies}::text[]
    ) AS p(device_user_code, raw_date_time, attendance_date, raw_status, raw_verify)
    LEFT JOIN attendance_workers w
      ON w.tenant_id = ${tenantContext.tenantId}
     AND w.device_user_code = p.device_user_code
    ON CONFLICT (tenant_id, device_serial, device_user_code, punched_at) DO NOTHING
  `

  // GROUP BY collapses every punch a worker made that day into one row before it reaches
  // ON CONFLICT. Without it a worker who punched in and out in the same batch would hit the
  // same conflict target twice in one statement, which Postgres rejects outright
  // ("ON CONFLICT DO UPDATE command cannot affect row a second time").
  // check_out_time stays NULL until a worker has punched at least TWICE that day.
  //
  // Previously it was a plain MAX, so a single punch produced check_out == check_in and rendered
  // as a zero-length shift — which reads as "worked 0 hours" rather than "hasn't punched out
  // yet". Those are very different things to an estate manager, and forgetting to punch out is
  // routine: the SmartOffice365 report this replaces shows exactly that case (Bopaiah, in at
  // 07:55:42, out 00:00, still marked Present), and it happened on the very first live punch
  // through this pipeline.
  //
  // The conflict branch has to reconstruct both ends rather than merge column-wise, because this
  // protocol delivers ONE punch per HTTP request: the second punch of the day arrives as its own
  // statement whose EXCLUDED.check_out_time is itself NULL. Merging the columns independently
  // would keep NULL forever and no worker would ever get a check-out. So: take the earliest
  // in-time seen either side, take the latest of every timestamp seen either side, and NULLIF
  // them together — equal means still only one distinct punch.
  const attendanceUpsert = sql`
    INSERT INTO attendance_records (
      tenant_id, worker_id, attendance_date, marked_by, source, check_in_time, check_out_time
    )
    SELECT
      ${tenantContext.tenantId}, w.id, p.attendance_date::date, ${markedBy}, 'biometric',
      MIN(p.raw_date_time::timestamp AT TIME ZONE ${BIOMETRIC_DEVICE_TIMEZONE}),
      NULLIF(
        MAX(p.raw_date_time::timestamp AT TIME ZONE ${BIOMETRIC_DEVICE_TIMEZONE}),
        MIN(p.raw_date_time::timestamp AT TIME ZONE ${BIOMETRIC_DEVICE_TIMEZONE})
      )
    FROM unnest(
      ${codes}::text[], ${rawDateTimes}::text[], ${dates}::text[]
    ) AS p(device_user_code, raw_date_time, attendance_date)
    JOIN attendance_workers w
      ON w.tenant_id = ${tenantContext.tenantId}
     AND w.device_user_code = p.device_user_code
    GROUP BY w.id, p.attendance_date
    ON CONFLICT (tenant_id, worker_id, attendance_date) DO UPDATE
    SET check_in_time = LEAST(
          COALESCE(attendance_records.check_in_time, EXCLUDED.check_in_time),
          EXCLUDED.check_in_time
        ),
        check_out_time = NULLIF(
          GREATEST(
            COALESCE(attendance_records.check_out_time, attendance_records.check_in_time, EXCLUDED.check_in_time),
            COALESCE(EXCLUDED.check_out_time, EXCLUDED.check_in_time)
          ),
          LEAST(
            COALESCE(attendance_records.check_in_time, EXCLUDED.check_in_time),
            EXCLUDED.check_in_time
          )
        ),
        source = 'biometric'
  `

  await runTenantQueries(sql, tenantContext, [punchInsert, attendanceUpsert])

  const unmappedCount = batch.filter((punch) => !workerIdByCode.has(punch.deviceUserCode)).length
  return { recorded: batch.length - unmappedCount, unmapped: unmappedCount }
}

// Backfills attendance_records for a device_user_code's past punches once an owner maps it to
// a worker — otherwise "map later" would only affect future punches, not the history already
// sitting in biometric_punches.
export async function reconcileUnmappedPunches(
  sql: NeonSql,
  tenantContext: TenantContext,
  deviceUserCode: string,
  workerId: string,
): Promise<void> {
  const affectedRows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      UPDATE biometric_punches
      SET worker_id = ${workerId}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND device_user_code = ${deviceUserCode}
        AND worker_id IS NULL
      RETURNING attendance_date::text
    `,
  )
  if (!affectedRows.length) return

  const uniqueDates = Array.from(new Set(affectedRows.map((row: any) => String(row.attendance_date))))
  const markedBy = "device:reconciled"

  // One statement covering every affected date. A code left unmapped for a whole season
  // backfills hundreds of dates, and one statement per date would rebuild the same oversized
  // transaction this module already had to fix on the ingest path.
  await runTenantQuery(
    sql,
    tenantContext,
    sql`
      INSERT INTO attendance_records (
        tenant_id, worker_id, attendance_date, marked_by, source, check_in_time, check_out_time
      )
      SELECT
        ${tenantContext.tenantId}, ${workerId}, attendance_date, ${markedBy}, 'biometric',
        MIN(punched_at), MAX(punched_at)
      FROM biometric_punches
      WHERE tenant_id = ${tenantContext.tenantId}
        AND worker_id = ${workerId}
        AND attendance_date = ANY(${uniqueDates}::date[])
      GROUP BY attendance_date
      ON CONFLICT (tenant_id, worker_id, attendance_date) DO UPDATE
      SET check_in_time = LEAST(COALESCE(attendance_records.check_in_time, EXCLUDED.check_in_time), EXCLUDED.check_in_time),
          check_out_time = GREATEST(COALESCE(attendance_records.check_out_time, EXCLUDED.check_out_time), EXCLUDED.check_out_time),
          source = 'biometric'
    `,
  )
}

/**
 * Remember the name a code was enrolled under on the terminal.
 *
 * The device is the only place this name exists, and it arrives exactly once -- on the
 * realtime_enroll_data push. Recording it turns an unmappable "Code 5" in the mapping panel into
 * "Code 5 — SUM", which is the difference between an estate retyping 45 workers and confirming
 * 45 suggestions.
 *
 * Upsert rather than insert: a terminal re-pushes enrolments after a reboot, and a worker
 * re-registering a finger should update the name rather than accumulate rows. Deliberately does
 * NOT create or rename an attendance_worker -- a mistyped or test enrolment must not silently
 * mint a payroll record, and a name already set in FarmFlow must win over the device's.
 */
export async function recordEnrollment(
  sql: NeonSql,
  tenantContext: TenantContext,
  deviceUserCode: string,
  userName: string | null,
  deviceSerial: string,
): Promise<void> {
  await runTenantQuery(
    sql,
    tenantContext,
    sql`
      INSERT INTO biometric_enrollments (tenant_id, device_user_code, user_name, device_serial)
      VALUES (${tenantContext.tenantId}, ${deviceUserCode}, ${userName}, ${deviceSerial})
      ON CONFLICT (tenant_id, device_user_code) DO UPDATE
      SET user_name    = COALESCE(EXCLUDED.user_name, biometric_enrollments.user_name),
          device_serial = EXCLUDED.device_serial,
          last_seen_at = NOW()
    `,
  )
}
