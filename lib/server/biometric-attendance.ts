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
 * The whole gate a heartbeat passes through, in ONE round trip.
 *
 * ⚠ THIS REPLACES A CACHE, AND THE CACHE WAS A SECURITY HOLE I PUT THERE. The first attempt at
 * cutting the heartbeat's four sequential round trips kept a 15-second serial→tenant cache. A
 * cache hit skips the `active = TRUE` in the lookup below, nothing downstream re-checks it, and
 * the device route toggles `active` on a PUT that never invalidated anything — so DEACTIVATING A
 * TERMINAL LEFT IT ABLE TO WRITE ATTENDANCE for up to fifteen seconds, on any warm instance that
 * had cached it. Raised by Greptile on PR #15, 2026-09-13.
 *
 * Invalidating on the PUT would have narrowed it and not closed it: the cache is per-instance, so
 * other warm instances would have kept serving the stale answer until it expired regardless.
 *
 * Batching removes the trade instead of managing it. Rate limiting and the serial lookup were two
 * sequential trips at the top of every request; they are now one transaction, so the latency win
 * is the same and the authorisation check is live on every single request. `rate_limit_counters`
 * carries no tenant_id and has RLS off, so the two statements sit happily under one owner context.
 *
 * A cache in front of an authorisation decision has to be justified against the worst case, not
 * the common one. There was a way to avoid needing one.
 */
export type HeartbeatGate<TLimits> = {
  limits: TLimits
  device: ResolvedDevice | null
}

export async function resolveHeartbeatGate<TLimits>(
  sql: NeonSql,
  rateLimit: { text: string; params: (string | number)[]; interpret: (rows: any[]) => TLimits },
  serialNumber: string,
): Promise<HeartbeatGate<TLimits>> {
  const [, , counts, devices] = (await sql.transaction([
    // Owner context for the device lookup; rate_limit_counters carries no tenant_id and no RLS.
    sql`SELECT set_config('app.tenant_id', '', true)`,
    sql`SELECT set_config('app.role', 'owner', true)`,
    sql.query(rateLimit.text, rateLimit.params),
    sql`
      SELECT id, tenant_id
      FROM biometric_devices
      WHERE serial_number = ${serialNumber}
        AND active = TRUE
      LIMIT 1
    `,
  ])) as any[][]

  const device = (devices as any[])[0]
  return {
    // Counting and the limit comparison stay in lib/rate-limit.ts; only the execution moved here.
    limits: rateLimit.interpret(counts as any[]),
    device: device ? { deviceId: String(device.id), tenantId: String(device.tenant_id) } : null,
  }
}

export async function resolveTenantByDeviceSerial(sql: NeonSql, serialNumber: string): Promise<ResolvedDevice | null> {
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
  return { deviceId: String((rows[0] as any).id), tenantId: String((rows[0] as any).tenant_id) }
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
