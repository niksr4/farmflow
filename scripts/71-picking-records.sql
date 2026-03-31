-- Migration 71: Per-worker piece-rate picking records.
-- Tracks cherry picked per worker per day, separate from aggregate labor_transactions.

CREATE TABLE IF NOT EXISTS picking_records (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID           NOT NULL,
  worker_id   UUID           NOT NULL,
  pick_date   DATE           NOT NULL,
  kg_picked   NUMERIC(10,3)  NOT NULL CHECK (kg_picked > 0),
  rate_per_kg NUMERIC(10,2)  NOT NULL CHECK (rate_per_kg >= 0),
  location_id UUID           NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_picking_records_tenant_date
  ON picking_records (tenant_id, pick_date DESC);

CREATE INDEX IF NOT EXISTS idx_picking_records_tenant_worker
  ON picking_records (tenant_id, worker_id);

DO $$
BEGIN
  IF to_regclass('tenants') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picking_records_tenant_fk')
  THEN
    ALTER TABLE picking_records
      ADD CONSTRAINT picking_records_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('attendance_workers') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picking_records_worker_fk')
  THEN
    ALTER TABLE picking_records
      ADD CONSTRAINT picking_records_worker_fk
      FOREIGN KEY (worker_id) REFERENCES attendance_workers(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE picking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE picking_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON picking_records;
CREATE POLICY tenant_isolation ON picking_records
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );
