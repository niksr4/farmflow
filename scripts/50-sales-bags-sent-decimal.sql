-- Allow decimal bags for sales records (bags_sent previously INTEGER in older schemas).
ALTER TABLE sales_records
  ALTER COLUMN bags_sent TYPE NUMERIC(10,2) USING COALESCE(bags_sent, 0)::numeric,
  ALTER COLUMN bags_sent SET DEFAULT 0;

