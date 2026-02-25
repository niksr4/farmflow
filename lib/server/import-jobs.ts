import "server-only"

import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

const DEFAULT_IMPORT_JOB_RETENTION_DAYS = 30
const DEFAULT_IMPORT_JOB_CSV_RETENTION_DAYS = 7

const toPositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

const IMPORT_JOB_RETENTION_DAYS = toPositiveInt(process.env.IMPORT_JOB_RETENTION_DAYS, DEFAULT_IMPORT_JOB_RETENTION_DAYS)
const IMPORT_JOB_CSV_RETENTION_DAYS = toPositiveInt(
  process.env.IMPORT_JOB_CSV_RETENTION_DAYS,
  DEFAULT_IMPORT_JOB_CSV_RETENTION_DAYS,
)

const isImportJobsTableMissing = (error: unknown) =>
  String((error as any)?.message || error || "").includes(`relation "import_jobs" does not exist`)

export interface ImportJobCleanupResult {
  skipped: boolean
  reason?: string
  retentionDays: number
  csvRetentionDays: number
  expiredCount: number
  redactedCount: number
  deletedCount: number
}

export async function runImportJobRetentionCleanup(): Promise<ImportJobCleanupResult> {
  if (!sql) {
    return {
      skipped: true,
      reason: "Database not configured",
      retentionDays: IMPORT_JOB_RETENTION_DAYS,
      csvRetentionDays: IMPORT_JOB_CSV_RETENTION_DAYS,
      expiredCount: 0,
      redactedCount: 0,
      deletedCount: 0,
    }
  }

  const ownerContext = normalizeTenantContext(undefined, "owner")

  try {
    const expiredRows = await runTenantQuery(
      sql,
      ownerContext,
      sql`
        UPDATE import_jobs
        SET status = 'expired',
            updated_at = NOW()
        WHERE mode = 'validate'
          AND status IN ('pending', 'validated')
          AND validation_expires_at IS NOT NULL
          AND validation_expires_at < NOW()
        RETURNING id
      `,
    )

    const redactedRows = await runTenantQuery(
      sql,
      ownerContext,
      sql`
        UPDATE import_jobs
        SET csv_text = NULL,
            csv_redacted_at = COALESCE(csv_redacted_at, NOW()),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'csv_redacted',
              true,
              'csv_redacted_at',
              NOW()
            ),
            updated_at = NOW()
        WHERE csv_text IS NOT NULL
          AND created_at <= NOW() - (${IMPORT_JOB_CSV_RETENTION_DAYS} * INTERVAL '1 day')
          AND status IN ('invalid', 'committed', 'failed', 'expired')
        RETURNING id
      `,
    )

    const deletedRows = await runTenantQuery(
      sql,
      ownerContext,
      sql`
        DELETE FROM import_jobs
        WHERE created_at <= NOW() - (${IMPORT_JOB_RETENTION_DAYS} * INTERVAL '1 day')
        RETURNING id
      `,
    )

    return {
      skipped: false,
      retentionDays: IMPORT_JOB_RETENTION_DAYS,
      csvRetentionDays: IMPORT_JOB_CSV_RETENTION_DAYS,
      expiredCount: expiredRows?.length || 0,
      redactedCount: redactedRows?.length || 0,
      deletedCount: deletedRows?.length || 0,
    }
  } catch (error) {
    if (isImportJobsTableMissing(error)) {
      return {
        skipped: true,
        reason: 'Run scripts/56-import-jobs.sql first.',
        retentionDays: IMPORT_JOB_RETENTION_DAYS,
        csvRetentionDays: IMPORT_JOB_CSV_RETENTION_DAYS,
        expiredCount: 0,
        redactedCount: 0,
        deletedCount: 0,
      }
    }
    throw error
  }
}
