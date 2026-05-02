-- Rubber tapping and processing records
-- Tracks the daily rubber workflow: latex collection → coagulation → sheet production
-- Pattern mirrors pepper_records (dedicated module, per-location, per-date records)

CREATE TABLE IF NOT EXISTS rubber_records (
  id              SERIAL PRIMARY KEY,
  tenant_id       TEXT        NOT NULL,
  location_id     TEXT        REFERENCES locations(id) ON DELETE SET NULL,
  record_date     DATE        NOT NULL,

  -- Daily latex collection (tapping output)
  latex_kg        NUMERIC(10, 2) NOT NULL DEFAULT 0,

  -- Coagulation stage (fresh latex + formic acid → cup lump, typically 24–48 hrs later)
  cup_lump_kg     NUMERIC(10, 2) NOT NULL DEFAULT 0,

  -- Sheet production (cup lump → rolled → washed → smoked RSS sheets)
  sheets_kg       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sheet_grade     VARCHAR(20)    NOT NULL DEFAULT 'RSS4',  -- RSS1–RSS5, Cup Lump, Block

  -- Dry Rubber Content % (useful for factory payments; fresh latex typically 28–35%)
  drc_pct         NUMERIC(5, 2)  NOT NULL DEFAULT 0,

  notes           TEXT           NOT NULL DEFAULT '',
  recorded_by     TEXT           NOT NULL DEFAULT 'system',
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT rubber_records_tenant_location_date_unique
    UNIQUE (tenant_id, location_id, record_date)
);

-- Separate unique constraint for records without a location (NULL is not equal to NULL)
CREATE UNIQUE INDEX IF NOT EXISTS rubber_records_tenant_null_location_date_unique
  ON rubber_records (tenant_id, record_date)
  WHERE location_id IS NULL;

-- RLS (same pattern as pepper_records)
ALTER TABLE rubber_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY rubber_records_tenant_isolation
  ON rubber_records
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Fast lookups by tenant + date range
CREATE INDEX IF NOT EXISTS rubber_records_tenant_date_idx
  ON rubber_records (tenant_id, record_date DESC);

CREATE INDEX IF NOT EXISTS rubber_records_location_idx
  ON rubber_records (tenant_id, location_id, record_date DESC);
