-- Create processing_records table in processing_db
CREATE TABLE IF NOT EXISTS processing_records (
  id SERIAL PRIMARY KEY,
  process_date DATE NOT NULL UNIQUE,
  
  -- Crop data
  crop_today DECIMAL(10, 2) DEFAULT 0,
  crop_todate DECIMAL(10, 2) DEFAULT 0,
  
  -- Ripe cherry
  ripe_today DECIMAL(10, 2) DEFAULT 0,
  ripe_todate DECIMAL(10, 2) DEFAULT 0,
  ripe_percent DECIMAL(5, 2) DEFAULT 0,
  
  -- Green cherry
  green_today DECIMAL(10, 2) DEFAULT 0,
  green_todate DECIMAL(10, 2) DEFAULT 0,
  green_percent DECIMAL(5, 2) DEFAULT 0,
  
  -- Float
  float_today DECIMAL(10, 2) DEFAULT 0,
  float_todate DECIMAL(10, 2) DEFAULT 0,
  float_percent DECIMAL(5, 2) DEFAULT 0,
  
  -- Wet parchment
  wet_parchment DECIMAL(10, 2) DEFAULT 0,
  fr_wp_percent DECIMAL(5, 2) DEFAULT 0,
  
  -- Dry parchment
  dry_parch DECIMAL(10, 2) DEFAULT 0,
  dry_p_todate DECIMAL(10, 2) DEFAULT 0,
  wp_dp_percent DECIMAL(5, 2) DEFAULT 0,
  
  -- Dry cherry
  dry_cherry DECIMAL(10, 2) DEFAULT 0,
  dry_cherry_todate DECIMAL(10, 2) DEFAULT 0,
  dry_cherry_percent DECIMAL(5, 2) DEFAULT 0,
  
  -- Bags
  dry_p_bags DECIMAL(10, 2) DEFAULT 0,
  dry_p_bags_todate DECIMAL(10, 2) DEFAULT 0,
  dry_cherry_bags DECIMAL(10, 2) DEFAULT 0,
  dry_cherry_bags_todate DECIMAL(10, 2) DEFAULT 0,
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on process_date for faster lookups
CREATE INDEX IF NOT EXISTS idx_processing_date ON processing_records(process_date DESC);
