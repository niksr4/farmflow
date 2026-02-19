-- Update sales_records table to new structure
-- New columns: batch_no, estate, bags_sent, kgs (auto-calc), bags_sold, price_per_bag, revenue (auto-calc), bank_account, notes

-- Add new columns (we'll keep old columns for now to preserve data)
ALTER TABLE sales_records 
ADD COLUMN IF NOT EXISTS batch_no VARCHAR(100),
ADD COLUMN IF NOT EXISTS estate VARCHAR(100),
ADD COLUMN IF NOT EXISTS kgs DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS bags_sold DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_per_bag DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS revenue DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS bank_account VARCHAR(255);

-- Make sure bags_sent exists (it should from previous migration)
ALTER TABLE sales_records 
ADD COLUMN IF NOT EXISTS bags_sent DECIMAL(10,2) DEFAULT 0;

-- Ensure decimal bags are supported even if older schemas created this as INTEGER.
ALTER TABLE sales_records
ALTER COLUMN bags_sent TYPE DECIMAL(10,2) USING COALESCE(bags_sent, 0)::numeric;

-- Ensure notes column exists
ALTER TABLE sales_records 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Also add updated_at column if it doesn't exist
ALTER TABLE sales_records 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add updated_at to dispatch_records if it doesn't exist
ALTER TABLE dispatch_records 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
