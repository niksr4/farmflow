-- Import job hardening (safe, additive).
-- Requires scripts/56-import-jobs.sql first.
-- Purpose:
-- 1) tighten integrity constraints/indexes
-- 2) support immutable requester linkage (user id)
-- 3) support CSV redaction timestamp for retention jobs

ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS requested_by_user_id UUID;

ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS csv_redacted_at TIMESTAMPTZ;

ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_tenant_fk;
ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_tenant_fk
  FOREIGN KEY (tenant_id)
  REFERENCES tenants(id)
  ON DELETE CASCADE;

ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_requested_by_user_fk;
ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_requested_by_user_fk
  FOREIGN KEY (requested_by_user_id)
  REFERENCES users(id)
  ON DELETE SET NULL;

ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_mode_status_check;
ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_mode_status_check CHECK (
    (mode = 'validate' AND status IN ('pending', 'validated', 'invalid', 'expired'))
    OR (mode = 'commit' AND status IN ('committed', 'failed'))
  );

CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_status_expires
  ON import_jobs (tenant_id, status, validation_expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_validated_active
  ON import_jobs (tenant_id, dataset, requested_by, validation_expires_at DESC)
  WHERE mode = 'validate' AND status = 'validated';

CREATE INDEX IF NOT EXISTS idx_import_jobs_validated_active_user
  ON import_jobs (tenant_id, dataset, requested_by_user_id, validation_expires_at DESC)
  WHERE mode = 'validate' AND status = 'validated' AND requested_by_user_id IS NOT NULL;
