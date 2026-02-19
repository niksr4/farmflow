-- Add bags_sent, kgs_sent, and kgs_received columns to sales_records table
-- bags_sent = number of bags dispatched
-- kgs_sent = auto-calculated as bags_sent * 50
-- kgs_received = actual kgs received at buyer

-- Add new columns
ALTER TABLE sales_records 
ADD COLUMN IF NOT EXISTS bags_sent DECIMAL(10,2) DEFAULT 0;

ALTER TABLE sales_records 
ADD COLUMN IF NOT EXISTS kgs_sent DECIMAL(10,2) DEFAULT 0;

ALTER TABLE sales_records 
ADD COLUMN IF NOT EXISTS kgs_received DECIMAL(10,2) DEFAULT 0;

-- Migrate data from weight_kgs to kgs_received for existing records
UPDATE sales_records 
SET kgs_received = weight_kgs,
    bags_sent = ROUND((weight_kgs / 50)::numeric, 2),
    kgs_sent = CEIL(weight_kgs / 50) * 50
WHERE kgs_received = 0 OR kgs_received IS NULL;
