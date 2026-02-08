-- Lot-based traceability columns and indexes.

ALTER TABLE processing_records
  ADD COLUMN IF NOT EXISTS lot_id text;

ALTER TABLE dispatch_records
  ADD COLUMN IF NOT EXISTS lot_id text;

ALTER TABLE sales_records
  ADD COLUMN IF NOT EXISTS lot_id text;

CREATE INDEX IF NOT EXISTS idx_processing_records_lot_id ON processing_records (lot_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_records_lot_id ON dispatch_records (lot_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_lot_id ON sales_records (lot_id);
