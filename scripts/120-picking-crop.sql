-- 120: picking records say which crop was picked.
--
-- Coffee and pepper are both picked by weight, into the same table, with no way to tell them
-- apart. A tenant growing both -- which Medappa and HoneyFarm do -- has one undifferentiated
-- number, so "what did picking cost" cannot be answered per crop and neither can yield per acre
-- once that arrives.
--
-- Existing rows become coffee. That is not a guess: pepper picking has never been separable in
-- this table, and every tenant with picking records grows coffee as the main crop, so coffee is
-- what those rows have always meant in practice. The column is NOT NULL with a default so no
-- write path can quietly omit it and recreate the same ambiguity.

ALTER TABLE picking_records
  ADD COLUMN IF NOT EXISTS crop TEXT NOT NULL DEFAULT 'coffee'
  CHECK (crop IN ('coffee', 'pepper'));

COMMENT ON COLUMN picking_records.crop IS
  'Which crop was picked. Coffee and pepper are both paid by weight but at different rates and against different yields, so they cannot share a total.';

CREATE INDEX IF NOT EXISTS idx_picking_records_tenant_crop_date
  ON picking_records (tenant_id, crop, pick_date DESC);
