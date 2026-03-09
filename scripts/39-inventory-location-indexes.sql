-- Enable location-aware inventory uniqueness without touching existing data.
-- Run after adding location_id columns (already present) and before inserting location-specific rows.

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.current_inventory'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(item_type, tenant_id)%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%location_id%'
  LOOP
    EXECUTE format('ALTER TABLE current_inventory DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END $$;

DO $$
DECLARE
  index_record RECORD;
BEGIN
  FOR index_record IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'current_inventory'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%(item_type, tenant_id)%'
      AND indexdef NOT ILIKE '%location_id%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', index_record.indexname);
  END LOOP;
END $$;

-- Normalize duplicate slots so unique indexes can be added safely on older tenant data.
WITH ranked AS (
  SELECT
    ctid,
    item_type,
    tenant_id,
    location_id,
    ROW_NUMBER() OVER (
      PARTITION BY item_type, tenant_id, location_id
      ORDER BY ctid
    ) AS row_number,
    SUM(COALESCE(quantity, 0)) OVER (
      PARTITION BY item_type, tenant_id, location_id
    ) AS merged_quantity,
    SUM(COALESCE(total_cost, 0)) OVER (
      PARTITION BY item_type, tenant_id, location_id
    ) AS merged_total_cost,
    FIRST_VALUE(unit) OVER (
      PARTITION BY item_type, tenant_id, location_id
      ORDER BY ctid
    ) AS merged_unit
  FROM current_inventory
),
keepers AS (
  SELECT
    ctid,
    merged_quantity,
    merged_total_cost,
    CASE
      WHEN merged_quantity > 0 THEN merged_total_cost / merged_quantity
      ELSE 0
    END AS merged_avg_price,
    merged_unit
  FROM ranked
  WHERE row_number = 1
),
updated AS (
  UPDATE current_inventory slot
  SET
    quantity = keepers.merged_quantity,
    total_cost = keepers.merged_total_cost,
    avg_price = keepers.merged_avg_price,
    unit = COALESCE(keepers.merged_unit, slot.unit)
  FROM keepers
  WHERE slot.ctid = keepers.ctid
  RETURNING slot.ctid
)
DELETE FROM current_inventory slot
USING ranked
WHERE slot.ctid = ranked.ctid
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_current_inventory_item_tenant_null_location
  ON current_inventory (item_type, tenant_id)
  WHERE location_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_current_inventory_item_tenant_location
  ON current_inventory (item_type, tenant_id, location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_current_inventory_tenant_item_location
  ON current_inventory (tenant_id, item_type, location_id);
