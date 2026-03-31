-- Migration 70: Extend attendance_workers with full worker profile fields.
-- Additive ALTER only — all new columns are nullable so existing rows are unaffected.

ALTER TABLE attendance_workers
  ADD COLUMN IF NOT EXISTS worker_type  TEXT CHECK (worker_type IN ('permanent', 'seasonal', 'contractor')),
  ADD COLUMN IF NOT EXISTS phone        TEXT,
  ADD COLUMN IF NOT EXISTS daily_rate   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS bank_name    TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc    TEXT;

CREATE INDEX IF NOT EXISTS idx_attendance_workers_tenant_type
  ON attendance_workers (tenant_id, worker_type)
  WHERE worker_type IS NOT NULL;
