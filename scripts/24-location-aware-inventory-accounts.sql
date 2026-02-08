-- Add location_id to inventory + accounts tables and backfill with default location per tenant.
-- Requires locations table to exist (run 23-normalize-processing.sql first).

-- Add location_id columns
ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE current_inventory ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE inventory_summary ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE labor_transactions ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE account_activities ADD COLUMN IF NOT EXISTS location_id UUID;

-- Backfill: use first location per tenant (by created_at) if not set.
WITH default_locations AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    id AS location_id
  FROM locations
  ORDER BY tenant_id, created_at ASC
)
UPDATE transaction_history th
SET location_id = dl.location_id
FROM default_locations dl
WHERE th.tenant_id = dl.tenant_id
  AND th.location_id IS NULL;

WITH default_locations AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    id AS location_id
  FROM locations
  ORDER BY tenant_id, created_at ASC
)
UPDATE current_inventory ci
SET location_id = dl.location_id
FROM default_locations dl
WHERE ci.tenant_id = dl.tenant_id
  AND ci.location_id IS NULL;

WITH default_locations AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    id AS location_id
  FROM locations
  ORDER BY tenant_id, created_at ASC
)
UPDATE inventory_summary isum
SET location_id = dl.location_id
FROM default_locations dl
WHERE isum.tenant_id = dl.tenant_id
  AND isum.location_id IS NULL;

WITH default_locations AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    id AS location_id
  FROM locations
  ORDER BY tenant_id, created_at ASC
)
UPDATE labor_transactions lt
SET location_id = dl.location_id
FROM default_locations dl
WHERE lt.tenant_id = dl.tenant_id
  AND lt.location_id IS NULL;

WITH default_locations AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    id AS location_id
  FROM locations
  ORDER BY tenant_id, created_at ASC
)
UPDATE expense_transactions et
SET location_id = dl.location_id
FROM default_locations dl
WHERE et.tenant_id = dl.tenant_id
  AND et.location_id IS NULL;

WITH default_locations AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    id AS location_id
  FROM locations
  ORDER BY tenant_id, created_at ASC
)
UPDATE account_activities aa
SET location_id = dl.location_id
FROM default_locations dl
WHERE aa.tenant_id = dl.tenant_id
  AND aa.location_id IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transaction_history_location_id ON transaction_history(location_id);
CREATE INDEX IF NOT EXISTS idx_current_inventory_location_id ON current_inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_summary_location_id ON inventory_summary(location_id);
CREATE INDEX IF NOT EXISTS idx_labor_transactions_location_id ON labor_transactions(location_id);
CREATE INDEX IF NOT EXISTS idx_expense_transactions_location_id ON expense_transactions(location_id);
CREATE INDEX IF NOT EXISTS idx_account_activities_location_id ON account_activities(location_id);
