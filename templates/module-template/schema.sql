-- Module schema template
CREATE TABLE IF NOT EXISTS __MODULE_TABLE__ (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  record_date DATE NOT NULL,
  metric_a DECIMAL(10, 2) DEFAULT 0,
  metric_b DECIMAL(10, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, location_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx___MODULE_TABLE___tenant_id ON __MODULE_TABLE__(tenant_id);
CREATE INDEX IF NOT EXISTS idx___MODULE_TABLE___location_id ON __MODULE_TABLE__(location_id);
CREATE INDEX IF NOT EXISTS idx___MODULE_TABLE___record_date ON __MODULE_TABLE__(record_date);

-- Every tenant_id-bearing table in this app is RLS-enforced (see scripts/98 and scripts/107,
-- which sweep and hard-fail on any tenant_id table left uncovered -- but only at the time they
-- run; a table created later, from this template, is NOT swept retroactively). Without this
-- block, a module scaffolded from this template would ship with no row-level security at all
-- and every tenant would be able to read and write every other tenant's rows. This is the same
-- bug class recorded in scripts/85-rubber-records.sql (ENABLE without FORCE, later found to be a
-- no-op against the schema-owning connection) -- copy this block verbatim, do not omit it.
ALTER TABLE __MODULE_TABLE__ ENABLE ROW LEVEL SECURITY;
ALTER TABLE __MODULE_TABLE__ FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON __MODULE_TABLE__;
CREATE POLICY tenant_isolation ON __MODULE_TABLE__
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );
