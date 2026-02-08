-- Alter labor_transactions table to support decimal labor counts (for half-day labor)
ALTER TABLE labor_transactions 
  ALTER COLUMN hf_laborers TYPE DECIMAL(10,2),
  ALTER COLUMN outside_laborers TYPE DECIMAL(10,2);

-- Update any existing records to ensure they have proper decimal format
UPDATE labor_transactions 
SET 
  hf_laborers = hf_laborers::DECIMAL(10,2),
  outside_laborers = outside_laborers::DECIMAL(10,2);
