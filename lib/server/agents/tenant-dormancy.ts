import "server-only"

// Shared tenant activity/dormancy signal.
//
// Two cron agents need to know "has this estate gone quiet?" and they used to answer it
// independently — the dormancy probe computed it, the weekly digest didn't ask at all. That
// split let a tenant receive a "haven't seen you in a few days" probe and then two full
// weekly digests reporting on an estate that had recorded nothing in ten weeks.
//
// This module is the single source of truth. It computes the raw signals once, cross-tenant;
// each agent applies its own policy on top (the probe fires early and once per episode, the
// digest stands down only after a much longer quiet stretch).
//
// Cross-tenant queries run from cron, not a per-request handler, so they use the RLS-bypassing
// owner connection — there's no single app.tenant_id session context to set here.
import { adminSql as sql } from "@/lib/server/db"

/** Probe fires once a tenant has had no login for this long. */
export const DORMANCY_PROBE_THRESHOLD_DAYS = 4

/** Never suppress a new tenant's digest — they're still being onboarded. */
export const DIGEST_MIN_TENANT_AGE_DAYS = 14

/**
 * Digest stands down after this long with neither a login nor a data write — two full
 * weekly cycles ignored. Deliberately much longer than the probe threshold: a 4-day login
 * gap is normal off-season and is not a reason to cut someone off from their weekly report.
 * This is the dial to turn if suppression feels too eager or too slow.
 */
export const DIGEST_QUIET_DAYS = 14

const DAY_MS = 86_400_000

const toRows = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  const candidate = (value as any)?.rows
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

export type TenantActivityInput = {
  tenantId: string
  tenantCreatedAt: Date
  lastLoginAt: Date | null
  lastDataWriteAt: Date | null
  lastProbeSentAt: Date | null
  probeLastKnownActivityAt: Date | null
}

export type TenantActivitySignal = TenantActivityInput & {
  daysSinceTenantCreated: number
  daysSinceLastLogin: number | null
  daysSinceLastDataWrite: number | null
  /** Days since the most recent login OR data write, falling back to tenant creation. */
  daysSinceAnyActivity: number
  /** Days since last login, falling back to tenant creation when they've never logged in. */
  daysSinceLastLoginOrCreation: number
  /**
   * Tenant has never logged in AND never written a row — the account exists but nobody has
   * ever opened it. Distinct from dormant: there is no "back to normal" to nudge them
   * towards, and an operations report about an estate they've never seen is nonsense.
   *
   * Requires BOTH to be empty on purpose. A tenant with data but no recorded login is an
   * older account whose logins predate the current security_events trail, not a fresh
   * account — suppressing on a missing login alone would silence real users.
   */
  isUnactivated: boolean
}

// Tables a live estate actually writes to. Keyed on created_at (row insertion), not the
// business date column — a user back-dating last month's labour is still active today,
// and a user who entered nothing is inactive even if they hold future-dated rows.
const ACTIVITY_TABLES = [
  "processing_records",
  "labor_transactions",
  "expense_transactions",
  "rainfall_records",
  "sales_records",
  "dispatch_records",
  "picking_records",
  "attendance_records",
  "journal_entries",
] as const

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime())

const daysBetween = (from: Date, now: Date): number =>
  Math.floor((now.getTime() - from.getTime()) / DAY_MS)

/**
 * Most recent sign of life in any form.
 *
 * Data writes count as much as logins: sessions are 30 days, so a tenant entering data
 * every single day can still show a three-week-old `auth_login_success` event. Treating a
 * stale login as dormancy on its own would silence digests for the most active users.
 */
export function mostRecentActivityAt(input: {
  tenantCreatedAt: Date
  lastLoginAt: Date | null
  lastDataWriteAt: Date | null
}): Date {
  return [input.lastLoginAt, input.lastDataWriteAt, input.tenantCreatedAt]
    .filter(isValidDate)
    .reduce((a, b) => (a.getTime() >= b.getTime() ? a : b))
}

/** Pure: turn raw per-tenant dates into the signal both agents read. */
export function buildActivitySignal(
  input: TenantActivityInput,
  now: Date = new Date(),
): TenantActivitySignal {
  return {
    ...input,
    daysSinceTenantCreated: daysBetween(input.tenantCreatedAt, now),
    daysSinceLastLogin: input.lastLoginAt ? daysBetween(input.lastLoginAt, now) : null,
    daysSinceLastDataWrite: input.lastDataWriteAt ? daysBetween(input.lastDataWriteAt, now) : null,
    daysSinceAnyActivity: daysBetween(mostRecentActivityAt(input), now),
    daysSinceLastLoginOrCreation: daysBetween(input.lastLoginAt ?? input.tenantCreatedAt, now),
    isUnactivated: input.lastLoginAt === null && input.lastDataWriteAt === null,
  }
}

/** One cross-tenant query producing the activity signals both agents read. */
export async function fetchTenantActivitySignals(): Promise<Map<string, TenantActivitySignal>> {
  const signals = new Map<string, TenantActivitySignal>()
  if (!sql) return signals

  const dataWriteUnion = ACTIVITY_TABLES.map(
    (table) => `SELECT tenant_id, MAX(created_at) AS ts FROM ${table} GROUP BY tenant_id`,
  ).join("\n        UNION ALL ")

  const result = await sql.query(`
    WITH login AS (
      SELECT tenant_id, MAX(created_at) AS last_login_at
      FROM security_events
      WHERE event_type = 'auth_login_success'
        AND actor_username NOT LIKE 'tenantsmoke_%'
        AND source IS DISTINCT FROM 'tenant-smoke-agent'
      GROUP BY tenant_id
    ),
    data_write AS (
      SELECT tenant_id, MAX(ts) AS last_data_write_at
      FROM (
        ${dataWriteUnion}
      ) writes
      GROUP BY tenant_id
    )
    SELECT
      t.id AS tenant_id,
      t.created_at,
      login.last_login_at,
      data_write.last_data_write_at,
      probe.last_probe_sent_at,
      probe.last_known_activity_at
    FROM tenants t
    LEFT JOIN login ON login.tenant_id = t.id
    LEFT JOIN data_write ON data_write.tenant_id = t.id
    LEFT JOIN tenant_dormancy_probes probe ON probe.tenant_id = t.id
    WHERE t.parent_tenant_id IS NULL
  `)

  const now = new Date()
  for (const row of toRows<any>(result)) {
    const signal = buildActivitySignal(
      {
        tenantId: String(row.tenant_id),
        tenantCreatedAt: new Date(row.created_at),
        lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : null,
        lastDataWriteAt: row.last_data_write_at ? new Date(row.last_data_write_at) : null,
        lastProbeSentAt: row.last_probe_sent_at ? new Date(row.last_probe_sent_at) : null,
        probeLastKnownActivityAt: row.last_known_activity_at
          ? new Date(row.last_known_activity_at)
          : null,
      },
      now,
    )
    signals.set(signal.tenantId, signal)
  }

  return signals
}

const describeGap = (label: string, at: Date | null, days: number | null): string =>
  at ? `${label} ${days}d ago` : `${label} never`

/**
 * Digest policy: stand down only for tenants old enough to judge, that have shown no
 * sign of life at all — neither a login nor a data write — for DIGEST_QUIET_DAYS.
 * The dormancy probe owns re-engagement for these tenants; sending both would mean two
 * emails a week telling the same person opposite things.
 */
export function evaluateDigestDormancy(signal: TenantActivitySignal): {
  dormant: boolean
  reason: string | null
} {
  // Checked before the new-tenant grace period: grace exists so a tenant who has started
  // using the product isn't judged too early, not so an account nobody has ever opened
  // gets a fortnight of daily weather reports about an empty estate.
  if (signal.isUnactivated) {
    return {
      dormant: true,
      reason: `never activated — no login or data entry since the tenant was created ${signal.daysSinceTenantCreated}d ago`,
    }
  }
  if (signal.daysSinceTenantCreated < DIGEST_MIN_TENANT_AGE_DAYS) {
    return { dormant: false, reason: null }
  }
  if (signal.daysSinceAnyActivity < DIGEST_QUIET_DAYS) {
    return { dormant: false, reason: null }
  }
  const detail = [
    describeGap("last login", signal.lastLoginAt, signal.daysSinceLastLogin),
    describeGap("last entry", signal.lastDataWriteAt, signal.daysSinceLastDataWrite),
  ].join(", ")
  return {
    dormant: true,
    reason: `no login or data entry for ${signal.daysSinceAnyActivity}d (${detail})`,
  }
}

/**
 * Probe policy — unchanged from the original inline implementation: dormant after
 * DORMANCY_PROBE_THRESHOLD_DAYS without a login, and sent once per dormancy episode.
 * Login (not data volume) is deliberately the signal here: a quiet week of data entry
 * can just be off-season, but nobody opening the app at all is worth checking on.
 */
export function evaluateProbeDormancy(signal: TenantActivitySignal): {
  dormant: boolean
  daysSinceLastLogin: number
  alreadyProbedThisEpisode: boolean
} {
  // Episode identity is "the login we last probed against". For a tenant that has NEVER
  // logged in that value is legitimately NULL, so `last_probe_sent_at` — not
  // `last_known_activity_at` — is what tells us a probe already went out. The previous
  // implementation keyed off the latter alone, which is falsy for a never-logged-in tenant,
  // so its episode never closed and it was re-probed on every daily cron run.
  const alreadyProbedThisEpisode = Boolean(
    signal.lastProbeSentAt &&
      (signal.lastLoginAt === null
        ? signal.probeLastKnownActivityAt === null
        : signal.probeLastKnownActivityAt !== null &&
          signal.probeLastKnownActivityAt.getTime() === signal.lastLoginAt.getTime()),
  )

  return {
    // Tenant must itself be old enough to have had a chance to go quiet — preserves the
    // `NOW() - t.created_at >= threshold` filter this policy previously did in SQL.
    //
    // Unactivated tenants are excluded: "nobody's logged in for N days" reads as absurd to
    // someone who was handed an account and never opened it, and it implies a lapse that
    // never happened. Getting them started is onboarding's job (or a human's), not this
    // agent's — note that manually-created tenants have no signup_requests row, so the
    // onboarding nudge agent will not pick them up either.
    dormant:
      !signal.isUnactivated &&
      signal.daysSinceTenantCreated >= DORMANCY_PROBE_THRESHOLD_DAYS &&
      signal.daysSinceLastLoginOrCreation >= DORMANCY_PROBE_THRESHOLD_DAYS,
    daysSinceLastLogin: signal.daysSinceLastLoginOrCreation,
    alreadyProbedThisEpisode,
  }
}
