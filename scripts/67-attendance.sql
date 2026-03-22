-- Attendance / muster tracking.
-- Additive only: creates a tenant-scoped employee roster and daily attendance records.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS attendance_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_workers_name_check CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_workers_tenant_name_active
  ON attendance_workers (tenant_id, LOWER(full_name))
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_attendance_workers_tenant_active_name
  ON attendance_workers (tenant_id, active, created_at DESC);

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  worker_id UUID NOT NULL,
  attendance_date DATE NOT NULL,
  marked_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_records_tenant_worker_date
  ON attendance_records (tenant_id, worker_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant_date
  ON attendance_records (tenant_id, attendance_date DESC);

DO $$
BEGIN
  IF to_regclass('tenants') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_workers_tenant_fk')
  THEN
    ALTER TABLE attendance_workers
      ADD CONSTRAINT attendance_workers_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('tenants') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_tenant_fk')
  THEN
    ALTER TABLE attendance_records
      ADD CONSTRAINT attendance_records_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('attendance_workers') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_worker_fk')
  THEN
    ALTER TABLE attendance_records
      ADD CONSTRAINT attendance_records_worker_fk
      FOREIGN KEY (worker_id) REFERENCES attendance_workers(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE attendance_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_workers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON attendance_workers;
CREATE POLICY tenant_isolation ON attendance_workers
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON attendance_records;
CREATE POLICY tenant_isolation ON attendance_records
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );
