-- Set defaults for required sales columns to align with current API inserts
ALTER TABLE sales_records ALTER COLUMN bag_type SET DEFAULT 'Dry Parchment';
ALTER TABLE sales_records ALTER COLUMN weight_kgs SET DEFAULT 0;
ALTER TABLE sales_records ALTER COLUMN price_per_kg SET DEFAULT 0;
ALTER TABLE sales_records ALTER COLUMN total_revenue SET DEFAULT 0;
