-- Normalize inventory to tenant-wide scope (no location_id).
-- Run if you want inventory + transaction history to be tenant-wide only.

UPDATE transaction_history
SET location_id = NULL
WHERE location_id IS NOT NULL;

UPDATE current_inventory
SET location_id = NULL
WHERE location_id IS NOT NULL;

-- NOTE: inventory_summary is a view in Neon, so it cannot be updated directly.
-- If you ever convert it to a table, you can set location_id to NULL there too.
