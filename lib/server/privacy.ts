import "server-only"

import type { NeonQueryFunction, NeonQueryPromise } from "@neondatabase/serverless"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import type { SessionUser } from "@/lib/server/auth"
import { decryptSensitiveJson, encryptSensitiveJson } from "@/lib/server/field-encryption"
import { PRIVACY_NOTICE_VERSION, PRIVACY_RETENTION } from "@/lib/privacy-config"
import {
  isReservedPlatformUsername,
  isSystemUsername,
  normalizeUsername,
  normalizeUsernameLookup,
} from "@/lib/usernames"

type PrivacySchemaStatus = {
  ok: boolean
  missingUserColumns: string[]
  missingTables: string[]
}

type PrivacyStatus = {
  noticeVersion: string
  acceptedAt: string | null
  consentMarketing: boolean
  consentMarketingUpdatedAt: string | null
  deletionRequestedAt: string | null
  anonymizedAt: string | null
}

const REQUIRED_USER_COLUMNS = [
  "privacy_notice_version",
  "privacy_notice_accepted_at",
  "consent_marketing",
  "consent_marketing_updated_at",
  "deletion_requested_at",
  "anonymized_at",
]

const isMissingRelation = (error: unknown) => {
  const message = String((error as Error)?.message || error)
  return message.includes("does not exist") && message.includes("relation")
}

type NeonSql = NeonQueryFunction<any, any>

const ensureSql = (): NeonSql => {
  if (!sql) {
    throw new Error("Database not configured")
  }
  return sql as NeonSql
}

export async function ensurePrivacySchema(sessionUser: SessionUser): Promise<PrivacySchemaStatus> {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const columns = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = ANY(${REQUIRED_USER_COLUMNS})
    `,
  )
  const columnSet = new Set((columns || []).map((row: any) => String(row.column_name)))
  const missingUserColumns = REQUIRED_USER_COLUMNS.filter((column) => !columnSet.has(column))

  const tables = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT to_regclass('privacy_requests') AS table_name
    `,
  )
  const missingTables = tables?.[0]?.table_name ? [] : ["privacy_requests"]

  return {
    ok: missingUserColumns.length === 0 && missingTables.length === 0,
    missingUserColumns,
    missingTables,
  }
}

const safeQuery = async <T = any>(
  query: NeonQueryPromise<any, any, any>,
  tenantContext: { tenantId: string; role: string },
  fallback: T[],
): Promise<T[]> => {
  try {
    return (await runTenantQuery(ensureSql(), tenantContext, query)) as T[]
  } catch (error) {
    if (isMissingRelation(error)) {
      return fallback
    }
    throw error
  }
}

const safeExec = async (
  query: NeonQueryPromise<any, any, any>,
  tenantContext: { tenantId: string; role: string },
) => {
  try {
    await runTenantQuery(ensureSql(), tenantContext, query)
  } catch (error) {
    if (!isMissingRelation(error)) {
      throw error
    }
  }
}

export async function getPrivacyStatus(sessionUser: SessionUser): Promise<PrivacyStatus> {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const rows = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT privacy_notice_version,
        privacy_notice_accepted_at,
        consent_marketing,
        consent_marketing_updated_at,
        deletion_requested_at,
        anonymized_at
      FROM users
      WHERE id = ${sessionUser.id}
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  const row = rows?.[0] || {}
  return {
    noticeVersion: PRIVACY_NOTICE_VERSION,
    acceptedAt: row.privacy_notice_accepted_at ? new Date(row.privacy_notice_accepted_at).toISOString() : null,
    consentMarketing: Boolean(row.consent_marketing),
    consentMarketingUpdatedAt: row.consent_marketing_updated_at
      ? new Date(row.consent_marketing_updated_at).toISOString()
      : null,
    deletionRequestedAt: row.deletion_requested_at ? new Date(row.deletion_requested_at).toISOString() : null,
    anonymizedAt: row.anonymized_at ? new Date(row.anonymized_at).toISOString() : null,
  }
}

export async function acceptPrivacyNotice(sessionUser: SessionUser) {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  await runTenantQuery(
    db,
    tenantContext,
    db`
      UPDATE users
      SET privacy_notice_version = ${PRIVACY_NOTICE_VERSION},
          privacy_notice_accepted_at = NOW()
      WHERE id = ${sessionUser.id}
        AND tenant_id = ${tenantContext.tenantId}
    `,
  )
}

export async function updateMarketingConsent(sessionUser: SessionUser, consent: boolean) {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  await runTenantQuery(
    db,
    tenantContext,
    db`
      UPDATE users
      SET consent_marketing = ${consent},
          consent_marketing_updated_at = NOW()
      WHERE id = ${sessionUser.id}
        AND tenant_id = ${tenantContext.tenantId}
    `,
  )
}

export async function exportPersonalData(sessionUser: SessionUser) {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const userRows = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT id, username, role, tenant_id, created_at,
        privacy_notice_version, privacy_notice_accepted_at,
        consent_marketing, consent_marketing_updated_at,
        deletion_requested_at, anonymized_at
      FROM users
      WHERE id = ${sessionUser.id}
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  const userRow = userRows?.[0] || null
  const userId = userRow?.id

  const auditLogs = await safeQuery(
    db`
      SELECT id, user_id, username, role, action, entity_type, entity_id, before_data, after_data, created_at
      FROM audit_logs
      WHERE tenant_id = ${tenantContext.tenantId}
        AND (username = ${sessionUser.username} OR user_id = ${userId})
      ORDER BY created_at DESC
    `,
    tenantContext,
    [],
  )

  const transactionHistory = await safeQuery(
    db`
      SELECT id, item_type, quantity, transaction_type, notes, transaction_date, user_id, price, total_cost, unit, location_id
      FROM transaction_history
      WHERE tenant_id = ${tenantContext.tenantId}
        AND user_id = ${sessionUser.username}
      ORDER BY transaction_date DESC
    `,
    tenantContext,
    [],
  )

  const rainfallRecords = await safeQuery(
    db`
      SELECT id, record_date, inches, cents, notes, created_at, user_id
      FROM rainfall_records
      WHERE tenant_id = ${tenantContext.tenantId}
        AND user_id = ${sessionUser.username}
      ORDER BY record_date DESC
    `,
    tenantContext,
    [],
  )

  const dispatchRecords = await safeQuery(
    db`
      SELECT id, dispatch_date, estate, coffee_type, bag_type, bags_dispatched, price_per_bag, buyer_name, notes, created_by, created_at, updated_at
      FROM dispatch_records
      WHERE tenant_id = ${tenantContext.tenantId}
        AND created_by = ${sessionUser.username}
      ORDER BY dispatch_date DESC
    `,
    tenantContext,
    [],
  )

  const curingRecords = await safeQuery(
    db`
      SELECT id, location_id, lot_id, coffee_type, process_type, process_date, intake_kg, intake_bags, moisture_start_pct,
        moisture_end_pct, drying_days, output_kg, output_bags, loss_kg, storage_bin, recorded_by, notes, created_at, updated_at
      FROM curing_records
      WHERE tenant_id = ${tenantContext.tenantId}
        AND recorded_by = ${sessionUser.username}
      ORDER BY process_date DESC
    `,
    tenantContext,
    [],
  )

  const qualityRecords = await safeQuery(
    db`
      SELECT id, location_id, lot_id, coffee_type, process_type, grade_date, grade, moisture_pct, screen_size, defects_count,
        defect_notes, sample_weight_g, outturn_pct, cup_score, buyer_reference, graded_by, notes, created_at, updated_at
      FROM quality_grading_records
      WHERE tenant_id = ${tenantContext.tenantId}
        AND graded_by = ${sessionUser.username}
      ORDER BY grade_date DESC
    `,
    tenantContext,
    [],
  )

  const pepperRecords = await safeQuery(
    db`
      SELECT id, location_id, process_date, kg_picked, green_pepper, green_pepper_percent, dry_pepper, dry_pepper_percent,
        notes, recorded_by, created_at, updated_at
      FROM pepper_records
      WHERE tenant_id = ${tenantContext.tenantId}
        AND recorded_by = ${sessionUser.username}
      ORDER BY process_date DESC
    `,
    tenantContext,
    [],
  )

  /**
   * ⚠ user_id ONLY — this is the clause that turned the username ambiguity into an actual
   * disclosure, and it is one line further in than the updates Greptile flagged.
   *
   * Matching `username = ${sessionUser.username} OR user_id = ${sessionUser.id}` means a personal
   * data export is authorised by a MUTABLE, REUSABLE string. Anonymization frees a username; a
   * later person registering under it would have been handed the earlier person's deletion
   * request -- its type, its details, its dates -- in their own DPDP export. Fixing only the two
   * UPDATEs would have left this reachable by any stale row already in the table.
   *
   * A row with user_id NULL belongs to somebody anonymized and is nobody's personal data to
   * export any more, which is precisely what anonymizing them was for.
   */
  const privacyRequests = await safeQuery(
    db`
      SELECT id, request_type, request_details, status, created_at, resolved_at
      FROM privacy_requests
      WHERE tenant_id = ${tenantContext.tenantId}
        AND user_id = ${sessionUser.id}
      ORDER BY created_at DESC
    `,
    tenantContext,
    [],
  )

  const normalizedPrivacyRequests = privacyRequests.map((row: any) => ({
    ...row,
    request_details: decryptSensitiveJson(row.request_details),
  }))

  return {
    generated_at: new Date().toISOString(),
    tenant_id: tenantContext.tenantId,
    user: userRow,
    records: {
      audit_logs: auditLogs,
      transaction_history: transactionHistory,
      rainfall_records: rainfallRecords,
      dispatch_records: dispatchRecords,
      curing_records: curingRecords,
      quality_grading_records: qualityRecords,
      pepper_records: pepperRecords,
      privacy_requests: normalizedPrivacyRequests,
    },
  }
}

export async function updateUsername(sessionUser: SessionUser, newUsername: string) {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const trimmed = normalizeUsername(newUsername)
  if (!trimmed) {
    throw new Error("New username is required")
  }
  if (isSystemUsername(trimmed)) {
    throw new Error("System usernames are reserved")
  }
  if (isReservedPlatformUsername(trimmed)) {
    throw new Error("Username 'owner' is reserved for the platform account")
  }

  const currentUserRows = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT username
      FROM users
      WHERE id = ${sessionUser.id}
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  const currentUsername = String(currentUserRows?.[0]?.username || sessionUser.username || "").trim()
  if (!currentUsername) {
    throw new Error("User not found")
  }

  const existing = await runTenantQuery(
    db,
    normalizeTenantContext(undefined, "owner"),
    db`
      SELECT id
      FROM users
      WHERE LOWER(BTRIM(username)) = ${normalizeUsernameLookup(trimmed)}
        AND id <> ${sessionUser.id}
      LIMIT 1
    `,
  )
  if (existing?.length) {
    throw new Error("Username already exists")
  }

  await runTenantQuery(
    db,
    tenantContext,
    db`
      UPDATE users
      SET username = ${trimmed}
      WHERE id = ${sessionUser.id}
        AND tenant_id = ${tenantContext.tenantId}
    `,
  )

  const updates = [
    db`
      UPDATE transaction_history
      SET user_id = ${trimmed}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND user_id = ${currentUsername}
    `,
    db`
      UPDATE rainfall_records
      SET user_id = ${trimmed}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND user_id = ${currentUsername}
    `,
    db`
      UPDATE dispatch_records
      SET created_by = ${trimmed}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND created_by = ${currentUsername}
    `,
    db`
      UPDATE curing_records
      SET recorded_by = ${trimmed}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND recorded_by = ${currentUsername}
    `,
    db`
      UPDATE quality_grading_records
      SET graded_by = ${trimmed}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND graded_by = ${currentUsername}
    `,
    db`
      UPDATE pepper_records
      SET recorded_by = ${trimmed}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND recorded_by = ${currentUsername}
    `,
    db`
      UPDATE audit_logs
      SET username = ${trimmed}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND username = ${currentUsername}
    `,
    /**
     * privacy_requests.username is a denormalized copy (see requestDeletion below) -- left out of
     * this rename list it would keep showing a renamed user's old username indefinitely.
     *
     * ⚠ MATCHED ON user_id, NOT ON USERNAME, and the difference is a privacy leak rather than a
     * tidiness question. Usernames are mutable AND reusable: once a user is anonymized their old
     * name is freed, and a later person can take it. Matching `username = ${currentUsername}`
     * would then let this rename rewrite a DIFFERENT person's historical deletion request --
     * relabelling a stranger's row with the current user's new name while leaving its original
     * user_id intact. Raised by Greptile on PR #22.
     *
     * Every row this should touch belongs to this user and carries their id. A row whose user_id
     * is NULL belongs to somebody already anonymized and must never be re-attached to anyone.
     */
    db`
      UPDATE privacy_requests
      SET username = ${trimmed}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND user_id = ${sessionUser.id}
    `,
  ]

  for (const query of updates) {
    await safeExec(query, tenantContext)
  }
}

export async function requestDeletion(sessionUser: SessionUser, reason?: string | null) {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const encryptedDetails = encryptSensitiveJson(reason ? { reason } : null)
  await runTenantQuery(
    db,
    tenantContext,
    db`
      UPDATE users
      SET deletion_requested_at = NOW()
      WHERE id = ${sessionUser.id}
        AND tenant_id = ${tenantContext.tenantId}
    `,
  )

  await safeExec(
    db`
      INSERT INTO privacy_requests (tenant_id, user_id, username, request_type, request_details, status)
      SELECT tenant_id, id, username, 'deletion', ${encryptedDetails ? JSON.stringify(encryptedDetails) : null}::jsonb, 'open'
      FROM users
      WHERE id = ${sessionUser.id}
        AND tenant_id = ${tenantContext.tenantId}
    `,
    tenantContext,
  )
}

const anonymizeReferences = async (
  tenantContext: { tenantId: string; role: string },
  oldUsername: string,
  anonymizedUsername: string,
  userId: string,
) => {
  const updates = [
    ensureSql()`
      UPDATE transaction_history
      SET user_id = ${anonymizedUsername}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND user_id = ${oldUsername}
    `,
    ensureSql()`
      UPDATE rainfall_records
      SET user_id = ${anonymizedUsername}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND user_id = ${oldUsername}
    `,
    ensureSql()`
      UPDATE dispatch_records
      SET created_by = ${anonymizedUsername}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND created_by = ${oldUsername}
    `,
    ensureSql()`
      UPDATE curing_records
      SET recorded_by = ${anonymizedUsername}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND recorded_by = ${oldUsername}
    `,
    ensureSql()`
      UPDATE quality_grading_records
      SET graded_by = ${anonymizedUsername}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND graded_by = ${oldUsername}
    `,
    ensureSql()`
      UPDATE pepper_records
      SET recorded_by = ${anonymizedUsername}
      WHERE tenant_id = ${tenantContext.tenantId}
        AND recorded_by = ${oldUsername}
    `,
    ensureSql()`
      UPDATE audit_logs
      SET username = ${anonymizedUsername},
          user_id = NULL
      WHERE tenant_id = ${tenantContext.tenantId}
        AND (username = ${oldUsername} OR user_id = ${userId})
    `,
    // Same reasoning as audit_logs immediately above: privacy_requests.username is a denormalized
    // copy (see requestDeletion) that this sweep previously left untouched, so a "deletion"
    // request's own row kept showing the anonymized user's real original username forever --
    // undermining the point of anonymizing them in the first place. user_id is nulled the same
    // way audit_logs' is (the column is nullable, ON DELETE SET NULL, per
    // scripts/40-dpdp-privacy.sql), since after anonymization there's no live user to still be
    // "the requester" of this row.
    /**
     * ⚠ user_id ONLY. The audit_logs sweep above matches `username OR user_id` because an audit
     * row can predate the user_id column and is append-only evidence; a privacy request is the
     * opposite -- it is the record of someone asking to be forgotten, and mis-attributing one is
     * the exact harm this module exists to prevent.
     *
     * Usernames are freed on anonymization and can be taken by someone else. `username =
     * ${oldUsername}` therefore also matches the stale rows of a PREVIOUSLY anonymized person who
     * once held this name, and would overwrite their request with this user's anonymized handle.
     * Raised by Greptile on PR #22.
     */
    ensureSql()`
      UPDATE privacy_requests
      SET username = ${anonymizedUsername},
          user_id = NULL
      WHERE tenant_id = ${tenantContext.tenantId}
        AND user_id = ${userId}
    `,
  ]

  for (const query of updates) {
    await safeExec(query, tenantContext)
  }
}

export async function anonymizeUserById(tenantId: string, userId: string) {
  const db = ensureSql()
  const tenantContext = normalizeTenantContext(tenantId, "owner")
  const rows = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT username
      FROM users
      WHERE id = ${userId}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `,
  )
  const oldUsername = rows?.[0]?.username
  if (!oldUsername) return

  const anonymizedUsername = `deleted-${userId.slice(0, 8)}`
  await anonymizeReferences(tenantContext, oldUsername, anonymizedUsername, userId)

  await runTenantQuery(
    db,
    tenantContext,
    db`
      UPDATE users
      SET username = ${anonymizedUsername},
          password_hash = CONCAT('anonymized-', gen_random_uuid()),
          consent_marketing = false,
          consent_marketing_updated_at = NULL,
          privacy_notice_version = NULL,
          privacy_notice_accepted_at = NULL,
          anonymized_at = NOW()
      WHERE id = ${userId}
        AND tenant_id = ${tenantId}
    `,
  )
}

export async function runRetentionCleanup() {
  const db = ensureSql()
  const ownerContext = normalizeTenantContext(undefined, "owner")
  const candidates = await runTenantQuery(
    db,
    ownerContext,
    db`
      SELECT id, tenant_id
      FROM users
      WHERE deletion_requested_at IS NOT NULL
        AND anonymized_at IS NULL
        AND deletion_requested_at <= NOW() - (${PRIVACY_RETENTION.deletionGraceDays} * INTERVAL '1 day')
    `,
  )

  for (const row of candidates || []) {
    await anonymizeUserById(String(row.tenant_id), String(row.id))
  }

  await safeExec(
    db`
      DELETE FROM privacy_requests
      WHERE created_at <= NOW() - (${PRIVACY_RETENTION.privacyRequestsDays} * INTERVAL '1 day')
    `,
    ownerContext,
  )

  await safeExec(
    db`
      DELETE FROM audit_logs
      WHERE created_at <= NOW() - (${PRIVACY_RETENTION.auditLogsDays} * INTERVAL '1 day')
    `,
    ownerContext,
  )

  await safeExec(
    db`
      DELETE FROM security_events
      WHERE created_at <= NOW() - (${PRIVACY_RETENTION.securityEventsDays} * INTERVAL '1 day')
    `,
    ownerContext,
  )
}

export async function listImpactUsers(
  sessionUser: SessionUser,
  startDate: string,
  endDate: string,
): Promise<{ username: string }[]> {
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  return safeQuery<{ username: string }>(
    ensureSql()`
      SELECT DISTINCT username
      FROM audit_logs
      WHERE tenant_id = ${tenantContext.tenantId}
        AND created_at >= ${startDate}::timestamp
        AND created_at <= ${endDate}::timestamp
      ORDER BY username
    `,
    tenantContext,
    [],
  )
}
