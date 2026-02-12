-- Daily journal entries for agronomy notes and fertilizer tracking

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  plot TEXT,
  title TEXT,
  fertilizer_name TEXT,
  fertilizer_composition TEXT,
  spray_composition TEXT,
  irrigation_done BOOLEAN NOT NULL DEFAULT FALSE,
  irrigation_notes TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_date
  ON journal_entries (tenant_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_location_date
  ON journal_entries (tenant_id, location_id, entry_date);
