-- Curing + Quality/Grading schema draft.
-- Add tables for curing/drying and quality/grading records.

CREATE TABLE IF NOT EXISTS curing_records (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  location_id UUID,
  lot_id TEXT,
  coffee_type TEXT,
  process_type TEXT,
  process_date DATE NOT NULL,
  intake_kg NUMERIC,
  intake_bags INTEGER,
  moisture_start_pct NUMERIC,
  moisture_end_pct NUMERIC,
  drying_days INTEGER,
  output_kg NUMERIC,
  output_bags INTEGER,
  loss_kg NUMERIC,
  storage_bin TEXT,
  recorded_by TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quality_grading_records (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  location_id UUID,
  lot_id TEXT,
  coffee_type TEXT,
  process_type TEXT,
  grade_date DATE NOT NULL,
  grade TEXT,
  moisture_pct NUMERIC,
  screen_size TEXT,
  defects_count INTEGER,
  defect_notes TEXT,
  sample_weight_g NUMERIC,
  outturn_pct NUMERIC,
  cup_score NUMERIC,
  buyer_reference TEXT,
  graded_by TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_curing_records_unique
  ON curing_records (tenant_id, location_id, process_date, lot_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_grading_records_unique
  ON quality_grading_records (tenant_id, location_id, grade_date, lot_id);

CREATE INDEX IF NOT EXISTS idx_curing_records_tenant_location_date
  ON curing_records (tenant_id, location_id, process_date);
CREATE INDEX IF NOT EXISTS idx_quality_grading_records_tenant_location_date
  ON quality_grading_records (tenant_id, location_id, grade_date);
