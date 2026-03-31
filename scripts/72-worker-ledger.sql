-- Migration 72: Worker advance and deduction ledger.
-- Tracks advances paid, deductions (food/accommodation), and manual adjustments per worker.

CREATE TABLE IF NOT EXISTS worker_ledger (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID           NOT NULL,
  worker_id   UUID           NOT NULL,
  entry_date  DATE           NOT NULL,
  entry_type  TEXT           NOT NULL CHECK (entry_type IN ('advance', 'deduction', 'adjustment')),
  amount      NUMERIC(12,2)  NOT NULL CHECK (amount > 0),
  description TEXT,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_ledger_tenant_worker_date
  ON worker_ledger (tenant_id, worker_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_worker_ledger_tenant_date
  ON worker_ledger (tenant_id, entry_date DESC);

DO $$
BEGIN
  IF to_regclass('tenants') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_ledger_tenant_fk')
  THEN
    ALTER TABLE worker_ledger
      ADD CONSTRAINT worker_ledger_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('attendance_workers') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_ledger_worker_fk')
  THEN
    ALTER TABLE worker_ledger
      ADD CONSTRAINT worker_ledger_worker_fk
      FOREIGN KEY (worker_id) REFERENCES attendance_workers(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE worker_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_ledger FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON worker_ledger;
CREATE POLICY tenant_isolation ON worker_ledger
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );
