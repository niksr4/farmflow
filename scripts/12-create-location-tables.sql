-- Rename existing processing_records table to hf_arabica (preserves all data)
ALTER TABLE IF EXISTS processing_records RENAME TO hf_arabica;

-- Create hf_robusta table
CREATE TABLE IF NOT EXISTS hf_robusta (
  id SERIAL PRIMARY KEY,
  process_date DATE NOT NULL UNIQUE,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create mv_robusta table
CREATE TABLE IF NOT EXISTS mv_robusta (
  id SERIAL PRIMARY KEY,
  process_date DATE NOT NULL UNIQUE,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create pg_robusta table
CREATE TABLE IF NOT EXISTS pg_robusta (
  id SERIAL PRIMARY KEY,
  process_date DATE NOT NULL UNIQUE,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster date lookups
CREATE INDEX IF NOT EXISTS idx_hf_arabica_date ON hf_arabica(process_date);
CREATE INDEX IF NOT EXISTS idx_hf_robusta_date ON hf_robusta(process_date);
CREATE INDEX IF NOT EXISTS idx_mv_robusta_date ON mv_robusta(process_date);
CREATE INDEX IF NOT EXISTS idx_pg_robusta_date ON pg_robusta(process_date);
