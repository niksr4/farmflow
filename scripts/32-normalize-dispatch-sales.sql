-- Normalize dispatch + sales data to use locations.
-- Run after 23-normalize-processing.sql (locations exist).
-- Safe to run multiple times.

ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS location_id UUID;

-- Backfill location_id from estate labels (matches name, code, or prefix token).
UPDATE dispatch_records dr
SET location_id = l.id
FROM locations l
WHERE dr.location_id IS NULL
  AND dr.tenant_id = l.tenant_id
  AND (
    LOWER(dr.estate) = LOWER(l.name)
    OR LOWER(dr.estate) = LOWER(l.code)
    OR LOWER(split_part(dr.estate, ' ', 1)) = LOWER(l.code)
    OR LOWER(split_part(dr.estate, ' ', 1)) = LOWER(l.name)
  );

UPDATE sales_records sr
SET location_id = l.id
FROM locations l
WHERE sr.location_id IS NULL
  AND sr.tenant_id = l.tenant_id
  AND (
    LOWER(sr.estate) = LOWER(l.name)
    OR LOWER(sr.estate) = LOWER(l.code)
    OR LOWER(split_part(sr.estate, ' ', 1)) = LOWER(l.code)
    OR LOWER(split_part(sr.estate, ' ', 1)) = LOWER(l.name)
  );

-- Helpful indexes for location filtering.
CREATE INDEX IF NOT EXISTS idx_dispatch_records_location_id ON dispatch_records(location_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_location_id ON sales_records(location_id);

-- Optional foreign keys (safe if already present).
DO $$ BEGIN
  ALTER TABLE dispatch_records
    ADD CONSTRAINT dispatch_records_location_fk
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sales_records
    ADD CONSTRAINT sales_records_location_fk
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
