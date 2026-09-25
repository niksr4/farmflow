import "server-only"

import { z } from "zod"

import { sql } from "@/lib/server/db"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import {
  hashCsv,
  isImportJobsUserColumnMissing,
  isUuid,
  VALIDATION_EXPIRY_MINUTES,
  type ImportMode,
  type ImportValidationError,
} from "@/lib/server/import-bulk-utils"

/**
 * The two-step bulk import's job lifecycle: create a validation job, read it back, mark it
 * committed or failed.
 *
 * Moved out of app/api/import-bulk/route.ts, which carried 274 lines of this ahead of the handler.
 * It is a state machine over `import_jobs` and it is the reason the import is safe: a commit does
 * not re-parse the user's CSV, it redeems a token against the rows that were already validated.
 * A job that can be redeemed twice, or after it expired, is how the same file gets imported
 * twice — so the expiry and status checks here are the guard, not decoration.
 *
 * Touches `import_jobs` and `users` only. Deliberately left behind in the route: everything that
 * writes the imported rows, because tests/labour-cost-readers.test.ts allowlists that route by
 * path for direct `labor_transactions` access and moving those writes would create an unlisted
 * reader.
 */

export type ValidationImportJobRow = {
  id: string
  validation_expires_at: string | Date | null
}

export type ValidationJobRecord = {
  id: string
  status: string
  dataset: string
  csv_text: string
  row_count: number
  validation_expires_at: string | Date | null
  errors: unknown
}

export type RequestBody = {
  dataset: string
  mode: ImportMode
  validationToken: string
  csv: string
}

export type SqlQuery = Parameters<typeof runTenantQueries>[2][number]

export const getErrorMessage = (error: unknown, fallback: string) => sanitizeRouteError(error, fallback)

export const importBulkBodySchema = z.object({
  dataset: z.string().trim().optional().default(""),
  mode: z.union([z.literal("validate"), z.literal("commit")]).optional().default("commit"),
  validationToken: z.string().trim().optional().default(""),
  csv: z.string().optional().default(""),
})

export async function createValidationImportJob(input: {
  tenantId: string
  role: string
  requestedBy: string
  requestedByUserId?: string | null
  dataset: string
  csvText: string
  rowCount: number
  errors: ImportValidationError[]
}): Promise<ValidationImportJobRow | null> {
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  try {
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO import_jobs (
          tenant_id,
          requested_by,
          requested_by_user_id,
          requested_role,
          dataset,
          mode,
          status,
          csv_sha256,
          csv_text,
          row_count,
          imported_count,
          skipped_count,
          error_count,
          errors,
          metadata,
          validation_expires_at
        )
        VALUES (
          ${tenantContext.tenantId}::uuid,
          ${input.requestedBy},
          ${input.requestedByUserId || null}::uuid,
          ${tenantContext.role},
          ${input.dataset},
          'validate',
          ${input.errors.length ? "invalid" : "validated"},
          ${hashCsv(input.csvText)},
          ${input.csvText},
          ${input.rowCount},
          0,
          ${input.errors.length},
          ${input.errors.length},
          ${JSON.stringify(input.errors)}::jsonb,
          ${JSON.stringify({ validationRows: input.rowCount })}::jsonb,
          NOW() + (${VALIDATION_EXPIRY_MINUTES} * INTERVAL '1 minute')
        )
        RETURNING id::text AS id, validation_expires_at
      `,
    )

    return (rows?.[0] || null) as ValidationImportJobRow | null
  } catch (error) {
    if (!isImportJobsUserColumnMissing(error)) throw error

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO import_jobs (
          tenant_id,
          requested_by,
          requested_role,
          dataset,
          mode,
          status,
          csv_sha256,
          csv_text,
          row_count,
          imported_count,
          skipped_count,
          error_count,
          errors,
          metadata,
          validation_expires_at
        )
        VALUES (
          ${tenantContext.tenantId}::uuid,
          ${input.requestedBy},
          ${tenantContext.role},
          ${input.dataset},
          'validate',
          ${input.errors.length ? "invalid" : "validated"},
          ${hashCsv(input.csvText)},
          ${input.csvText},
          ${input.rowCount},
          0,
          ${input.errors.length},
          ${input.errors.length},
          ${JSON.stringify(input.errors)}::jsonb,
          ${JSON.stringify({ validationRows: input.rowCount })}::jsonb,
          NOW() + (${VALIDATION_EXPIRY_MINUTES} * INTERVAL '1 minute')
        )
        RETURNING id::text AS id, validation_expires_at
      `,
    )

    return (rows?.[0] || null) as ValidationImportJobRow | null
  }
}

export async function resolveRequestedByUserId(input: { tenantId: string; role: string; username: string }) {
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  const username = String(input.username || "").trim()
  if (!username) return null
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id::text AS id
      FROM users
      WHERE tenant_id = ${tenantContext.tenantId}::uuid
        AND username = ${username}
      LIMIT 1
    `,
  )
  return rows?.[0]?.id ? String(rows[0].id) : null
}

export async function loadValidatedImportJob(input: {
  tenantId: string
  role: string
  requestedBy: string
  requestedByUserId?: string | null
  dataset: string
  validationToken: string
}): Promise<ValidationJobRecord | null> {
  // The token is client-supplied and cast with ::uuid below; a malformed one made Postgres raise
  // 22P02 and the commit answered 500. It is simply a token that matches no job.
  if (!isUuid(String(input.validationToken || "").trim())) return null
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  if (input.requestedByUserId) {
    try {
      const rows = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT
            id::text AS id,
            status,
            dataset,
            csv_text,
            row_count,
            validation_expires_at,
            errors
          FROM import_jobs
          WHERE id = ${input.validationToken}::uuid
            AND tenant_id = ${tenantContext.tenantId}::uuid
            AND dataset = ${input.dataset}
            AND (
              requested_by_user_id = ${input.requestedByUserId}::uuid
              OR (requested_by_user_id IS NULL AND requested_by = ${input.requestedBy})
            )
          LIMIT 1
        `,
      )
      return (rows?.[0] || null) as ValidationJobRecord | null
    } catch (error) {
      if (!isImportJobsUserColumnMissing(error)) throw error
    }
  }

  const fallbackRows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT
        id::text AS id,
        status,
        dataset,
        csv_text,
        row_count,
        validation_expires_at,
        errors
      FROM import_jobs
      WHERE id = ${input.validationToken}::uuid
        AND tenant_id = ${tenantContext.tenantId}::uuid
        AND requested_by = ${input.requestedBy}
        AND dataset = ${input.dataset}
      LIMIT 1
    `,
  )
  return (fallbackRows?.[0] || null) as ValidationJobRecord | null
}

export async function markImportJobCommitted(input: {
  tenantId: string
  role: string
  jobId: string
  imported: number
  skipped: number
  errors: ImportValidationError[]
}) {
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  await runTenantQuery(
    sql,
    tenantContext,
    sql`
      UPDATE import_jobs
      SET
        mode = 'commit',
        status = 'committed',
        imported_count = ${input.imported},
        skipped_count = ${input.skipped},
        error_count = ${input.errors.length},
        errors = ${JSON.stringify(input.errors)}::jsonb,
        committed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${input.jobId}::uuid
        AND tenant_id = ${tenantContext.tenantId}::uuid
    `,
  )
}

export async function markImportJobFailed(input: {
  tenantId: string
  role: string
  jobId: string
  message: string
}) {
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  await runTenantQuery(
    sql,
    tenantContext,
    sql`
      UPDATE import_jobs
      SET
        mode = 'commit',
        status = 'failed',
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{failure}', ${JSON.stringify({
          message: input.message,
          at: new Date().toISOString(),
        })}::jsonb, true),
        updated_at = NOW()
      WHERE id = ${input.jobId}::uuid
        AND tenant_id = ${tenantContext.tenantId}::uuid
    `,
  )
}
