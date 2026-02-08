-- Normalize processing + pepper data into tenant locations.
-- Safe to run multiple times (uses IF NOT EXISTS + ON CONFLICT).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS processing_records (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  coffee_type TEXT NOT NULL,
  process_date DATE NOT NULL,
  crop_today DECIMAL(10, 2),
  crop_todate DECIMAL(10, 2) DEFAULT 0,
  ripe_today DECIMAL(10, 2),
  ripe_todate DECIMAL(10, 2) DEFAULT 0,
  ripe_percent DECIMAL(10, 2) DEFAULT 0,
  green_today DECIMAL(10, 2),
  green_todate DECIMAL(10, 2) DEFAULT 0,
  green_percent DECIMAL(10, 2) DEFAULT 0,
  float_today DECIMAL(10, 2),
  float_todate DECIMAL(10, 2) DEFAULT 0,
  float_percent DECIMAL(10, 2) DEFAULT 0,
  wet_parchment DECIMAL(10, 2),
  fr_wp_percent DECIMAL(10, 2) DEFAULT 0,
  dry_parch DECIMAL(10, 2),
  dry_p_todate DECIMAL(10, 2) DEFAULT 0,
  wp_dp_percent DECIMAL(10, 2) DEFAULT 0,
  dry_cherry DECIMAL(10, 2),
  dry_cherry_todate DECIMAL(10, 2) DEFAULT 0,
  dry_cherry_percent DECIMAL(10, 2) DEFAULT 0,
  dry_p_bags DECIMAL(10, 2) DEFAULT 0,
  dry_p_bags_todate DECIMAL(10, 2) DEFAULT 0,
  dry_cherry_bags DECIMAL(10, 2) DEFAULT 0,
  dry_cherry_bags_todate DECIMAL(10, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, location_id, coffee_type, process_date)
);

CREATE TABLE IF NOT EXISTS pepper_records (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  process_date DATE NOT NULL,
  kg_picked DECIMAL(10, 2) DEFAULT 0,
  green_pepper DECIMAL(10, 2) DEFAULT 0,
  green_pepper_percent DECIMAL(10, 2) DEFAULT 0,
  dry_pepper DECIMAL(10, 2) DEFAULT 0,
  dry_pepper_percent DECIMAL(10, 2) DEFAULT 0,
  notes TEXT,
  recorded_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, location_id, process_date)
);

CREATE INDEX IF NOT EXISTS idx_locations_tenant_id ON locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_processing_tenant_id ON processing_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_processing_location_id ON processing_records(location_id);
CREATE INDEX IF NOT EXISTS idx_processing_date ON processing_records(process_date);
CREATE INDEX IF NOT EXISTS idx_pepper_tenant_id ON pepper_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pepper_location_id ON pepper_records(location_id);
CREATE INDEX IF NOT EXISTS idx_pepper_date ON pepper_records(process_date);

-- Seed default locations from existing processing tables.
INSERT INTO locations (tenant_id, name, code)
SELECT DISTINCT tenant_id, 'HF', 'HF' FROM hf_arabica WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, code) DO NOTHING;
INSERT INTO locations (tenant_id, name, code)
SELECT DISTINCT tenant_id, 'HF', 'HF' FROM hf_robusta WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, code) DO NOTHING;
INSERT INTO locations (tenant_id, name, code)
SELECT DISTINCT tenant_id, 'MV', 'MV' FROM mv_robusta WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, code) DO NOTHING;
INSERT INTO locations (tenant_id, name, code)
SELECT DISTINCT tenant_id, 'PG', 'PG' FROM pg_robusta WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Migrate coffee processing tables into unified table.
INSERT INTO processing_records (
  tenant_id, location_id, coffee_type, process_date,
  crop_today, crop_todate, ripe_today, ripe_todate, ripe_percent,
  green_today, green_todate, green_percent, float_today, float_todate, float_percent,
  wet_parchment, fr_wp_percent, dry_parch, dry_p_todate, wp_dp_percent,
  dry_cherry, dry_cherry_todate, dry_cherry_percent,
  dry_p_bags, dry_p_bags_todate, dry_cherry_bags, dry_cherry_bags_todate,
  notes, created_at, updated_at
)
SELECT
  h.tenant_id,
  l.id,
  'Arabica',
  h.process_date,
  h.crop_today, h.crop_todate, h.ripe_today, h.ripe_todate, h.ripe_percent,
  h.green_today, h.green_todate, h.green_percent, h.float_today, h.float_todate, h.float_percent,
  h.wet_parchment, h.fr_wp_percent, h.dry_parch, h.dry_p_todate, h.wp_dp_percent,
  h.dry_cherry, h.dry_cherry_todate, h.dry_cherry_percent,
  h.dry_p_bags, h.dry_p_bags_todate, h.dry_cherry_bags, h.dry_cherry_bags_todate,
  h.notes, h.created_at, h.updated_at
FROM hf_arabica h
JOIN locations l ON l.tenant_id = h.tenant_id AND l.code = 'HF'
ON CONFLICT (tenant_id, location_id, coffee_type, process_date) DO NOTHING;

INSERT INTO processing_records (
  tenant_id, location_id, coffee_type, process_date,
  crop_today, crop_todate, ripe_today, ripe_todate, ripe_percent,
  green_today, green_todate, green_percent, float_today, float_todate, float_percent,
  wet_parchment, fr_wp_percent, dry_parch, dry_p_todate, wp_dp_percent,
  dry_cherry, dry_cherry_todate, dry_cherry_percent,
  dry_p_bags, dry_p_bags_todate, dry_cherry_bags, dry_cherry_bags_todate,
  notes, created_at, updated_at
)
SELECT
  h.tenant_id,
  l.id,
  'Robusta',
  h.process_date,
  h.crop_today, h.crop_todate, h.ripe_today, h.ripe_todate, h.ripe_percent,
  h.green_today, h.green_todate, h.green_percent, h.float_today, h.float_todate, h.float_percent,
  h.wet_parchment, h.fr_wp_percent, h.dry_parch, h.dry_p_todate, h.wp_dp_percent,
  h.dry_cherry, h.dry_cherry_todate, h.dry_cherry_percent,
  h.dry_p_bags, h.dry_p_bags_todate, h.dry_cherry_bags, h.dry_cherry_bags_todate,
  h.notes, h.created_at, h.updated_at
FROM hf_robusta h
JOIN locations l ON l.tenant_id = h.tenant_id AND l.code = 'HF'
ON CONFLICT (tenant_id, location_id, coffee_type, process_date) DO NOTHING;

INSERT INTO processing_records (
  tenant_id, location_id, coffee_type, process_date,
  crop_today, crop_todate, ripe_today, ripe_todate, ripe_percent,
  green_today, green_todate, green_percent, float_today, float_todate, float_percent,
  wet_parchment, fr_wp_percent, dry_parch, dry_p_todate, wp_dp_percent,
  dry_cherry, dry_cherry_todate, dry_cherry_percent,
  dry_p_bags, dry_p_bags_todate, dry_cherry_bags, dry_cherry_bags_todate,
  notes, created_at, updated_at
)
SELECT
  h.tenant_id,
  l.id,
  'Robusta',
  h.process_date,
  h.crop_today, h.crop_todate, h.ripe_today, h.ripe_todate, h.ripe_percent,
  h.green_today, h.green_todate, h.green_percent, h.float_today, h.float_todate, h.float_percent,
  h.wet_parchment, h.fr_wp_percent, h.dry_parch, h.dry_p_todate, h.wp_dp_percent,
  h.dry_cherry, h.dry_cherry_todate, h.dry_cherry_percent,
  h.dry_p_bags, h.dry_p_bags_todate, h.dry_cherry_bags, h.dry_cherry_bags_todate,
  h.notes, h.created_at, h.updated_at
FROM mv_robusta h
JOIN locations l ON l.tenant_id = h.tenant_id AND l.code = 'MV'
ON CONFLICT (tenant_id, location_id, coffee_type, process_date) DO NOTHING;

INSERT INTO processing_records (
  tenant_id, location_id, coffee_type, process_date,
  crop_today, crop_todate, ripe_today, ripe_todate, ripe_percent,
  green_today, green_todate, green_percent, float_today, float_todate, float_percent,
  wet_parchment, fr_wp_percent, dry_parch, dry_p_todate, wp_dp_percent,
  dry_cherry, dry_cherry_todate, dry_cherry_percent,
  dry_p_bags, dry_p_bags_todate, dry_cherry_bags, dry_cherry_bags_todate,
  notes, created_at, updated_at
)
SELECT
  h.tenant_id,
  l.id,
  'Robusta',
  h.process_date,
  h.crop_today, h.crop_todate, h.ripe_today, h.ripe_todate, h.ripe_percent,
  h.green_today, h.green_todate, h.green_percent, h.float_today, h.float_todate, h.float_percent,
  h.wet_parchment, h.fr_wp_percent, h.dry_parch, h.dry_p_todate, h.wp_dp_percent,
  h.dry_cherry, h.dry_cherry_todate, h.dry_cherry_percent,
  h.dry_p_bags, h.dry_p_bags_todate, h.dry_cherry_bags, h.dry_cherry_bags_todate,
  h.notes, h.created_at, h.updated_at
FROM pg_robusta h
JOIN locations l ON l.tenant_id = h.tenant_id AND l.code = 'PG'
ON CONFLICT (tenant_id, location_id, coffee_type, process_date) DO NOTHING;

-- Seed pepper locations from existing tables.
INSERT INTO locations (tenant_id, name, code)
SELECT DISTINCT tenant_id, 'HF', 'HF' FROM hf_pepper WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, code) DO NOTHING;
INSERT INTO locations (tenant_id, name, code)
SELECT DISTINCT tenant_id, 'MV', 'MV' FROM mv_pepper WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, code) DO NOTHING;
INSERT INTO locations (tenant_id, name, code)
SELECT DISTINCT tenant_id, 'PG', 'PG' FROM pg_pepper WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Migrate pepper tables into unified pepper_records.
INSERT INTO pepper_records (
  tenant_id, location_id, process_date,
  kg_picked, green_pepper, green_pepper_percent, dry_pepper, dry_pepper_percent,
  notes, recorded_by, created_at, updated_at
)
SELECT
  p.tenant_id,
  l.id,
  p.process_date,
  p.kg_picked,
  p.green_pepper,
  p.green_pepper_percent,
  p.dry_pepper,
  p.dry_pepper_percent,
  p.notes,
  p.recorded_by,
  p.created_at,
  p.updated_at
FROM hf_pepper p
JOIN locations l ON l.tenant_id = p.tenant_id AND l.code = 'HF'
ON CONFLICT (tenant_id, location_id, process_date) DO NOTHING;

INSERT INTO pepper_records (
  tenant_id, location_id, process_date,
  kg_picked, green_pepper, green_pepper_percent, dry_pepper, dry_pepper_percent,
  notes, recorded_by, created_at, updated_at
)
SELECT
  p.tenant_id,
  l.id,
  p.process_date,
  p.kg_picked,
  p.green_pepper,
  p.green_pepper_percent,
  p.dry_pepper,
  p.dry_pepper_percent,
  p.notes,
  p.recorded_by,
  p.created_at,
  p.updated_at
FROM mv_pepper p
JOIN locations l ON l.tenant_id = p.tenant_id AND l.code = 'MV'
ON CONFLICT (tenant_id, location_id, process_date) DO NOTHING;

INSERT INTO pepper_records (
  tenant_id, location_id, process_date,
  kg_picked, green_pepper, green_pepper_percent, dry_pepper, dry_pepper_percent,
  notes, recorded_by, created_at, updated_at
)
SELECT
  p.tenant_id,
  l.id,
  p.process_date,
  p.kg_picked,
  p.green_pepper,
  p.green_pepper_percent,
  p.dry_pepper,
  p.dry_pepper_percent,
  p.notes,
  p.recorded_by,
  p.created_at,
  p.updated_at
FROM pg_pepper p
JOIN locations l ON l.tenant_id = p.tenant_id AND l.code = 'PG'
ON CONFLICT (tenant_id, location_id, process_date) DO NOTHING;
