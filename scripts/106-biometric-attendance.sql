-- Biometric fingerprint attendance integration (ADMS protocol).
-- Additive only: registers biometric devices, logs raw punches, and extends the
-- existing attendance_workers / attendance_records tables (scripts/67-attendance.sql).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS biometric_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  serial_number TEXT NOT NULL,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT biometric_devices_serial_number_unique UNIQUE (serial_number),
  CONSTRAINT biometric_devices_serial_check CHECK (char_length(btrim(serial_number)) BETWEEN 1 AND 60),
  CONSTRAINT biometric_devices_label_check CHECK (char_length(btrim(label)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_biometric_devices_tenant_active
  ON biometric_devices (tenant_id, active, created_at DESC);

CREATE TABLE IF NOT EXISTS biometric_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  device_id UUID NULL,
  device_serial TEXT NOT NULL,
  device_user_code TEXT NOT NULL,
  worker_id UUID NULL,
  punched_at TIMESTAMPTZ NOT NULL,
  attendance_date DATE NOT NULL,
  raw_status TEXT NULL,
  raw_verify TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_biometric_punches_dedup
  ON biometric_punches (tenant_id, device_serial, device_user_code, punched_at);

CREATE INDEX IF NOT EXISTS idx_biometric_punches_unmapped
  ON biometric_punches (tenant_id, device_user_code)
  WHERE worker_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_biometric_punches_tenant_date
  ON biometric_punches (tenant_id, attendance_date DESC);

ALTER TABLE attendance_workers
  ADD COLUMN IF NOT EXISTS device_user_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_workers_tenant_device_code
  ON attendance_workers (tenant_id, device_user_code)
  WHERE device_user_code IS NOT NULL;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_source_check') THEN
    ALTER TABLE attendance_records
      ADD CONSTRAINT attendance_records_source_check CHECK (source IN ('manual', 'biometric'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('tenants') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'biometric_devices_tenant_fk')
  THEN
    ALTER TABLE biometric_devices
      ADD CONSTRAINT biometric_devices_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('tenants') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'biometric_punches_tenant_fk')
  THEN
    ALTER TABLE biometric_punches
      ADD CONSTRAINT biometric_punches_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('biometric_devices') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'biometric_punches_device_fk')
  THEN
    ALTER TABLE biometric_punches
      ADD CONSTRAINT biometric_punches_device_fk
      FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('attendance_workers') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'biometric_punches_worker_fk')
  THEN
    ALTER TABLE biometric_punches
      ADD CONSTRAINT biometric_punches_worker_fk
      FOREIGN KEY (worker_id) REFERENCES attendance_workers(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE biometric_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_devices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON biometric_devices;
CREATE POLICY tenant_isolation ON biometric_devices
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

ALTER TABLE biometric_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_punches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON biometric_punches;
CREATE POLICY tenant_isolation ON biometric_punches
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );
