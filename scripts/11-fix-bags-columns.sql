-- Fix bags columns to use DECIMAL instead of INTEGER
-- This allows fractional bags (e.g., 2.4 bags)

ALTER TABLE processing_records 
  ALTER COLUMN dry_p_bags TYPE DECIMAL(10, 2),
  ALTER COLUMN dry_p_bags_todate TYPE DECIMAL(10, 2),
  ALTER COLUMN dry_cherry_bags TYPE DECIMAL(10, 2),
  ALTER COLUMN dry_cherry_bags_todate TYPE DECIMAL(10, 2);

-- Increase precision for percentage fields to handle values over 100%
ALTER TABLE processing_records
  ALTER COLUMN ripe_percent TYPE DECIMAL(10, 2),
  ALTER COLUMN green_percent TYPE DECIMAL(10, 2),
  ALTER COLUMN float_percent TYPE DECIMAL(10, 2),
  ALTER COLUMN fr_wp_percent TYPE DECIMAL(10, 2),
  ALTER COLUMN wp_dp_percent TYPE DECIMAL(10, 2),
  ALTER COLUMN dry_cherry_percent TYPE DECIMAL(10, 2);
