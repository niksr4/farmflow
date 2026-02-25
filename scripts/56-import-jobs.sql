-- Import validation/commit audit jobs.
-- Safe additive migration.
-- Purpose:
-- 1) support dry-run CSV validation tokens before commit
-- 2) track import commit outcomes and errors for auditability

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  requested_by TEXT NOT NULL,
  requested_role TEXT NOT NULL,
  dataset TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'validate',
  status TEXT NOT NULL DEFAULT 'pending',
  csv_sha256 TEXT,
  csv_text TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_expires_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT import_jobs_mode_check CHECK (mode IN ('validate', 'commit')),
  CONSTRAINT import_jobs_status_check CHECK (status IN ('pending', 'validated', 'invalid', 'committed', 'failed', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_created
  ON import_jobs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status_created
  ON import_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_dataset_created
  ON import_jobs (dataset, created_at DESC);
