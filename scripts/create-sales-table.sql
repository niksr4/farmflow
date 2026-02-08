-- Create sales_records table in dispatch database
-- This table tracks coffee sales with:
-- Date, B&L Batch No, Estate, Bags Sent, KGs (auto-calc bags x 50), 
-- Bags Sold (kgs/50), Price per Bag, Revenue (auto-calc), Bank Account, Notes

CREATE TABLE IF NOT EXISTS sales_records (
    id SERIAL PRIMARY KEY,
    sale_date DATE NOT NULL,
    batch_no VARCHAR(100),
    estate VARCHAR(100),
    bags_sent INTEGER NOT NULL DEFAULT 0,
    kgs DECIMAL(10,2) NOT NULL DEFAULT 0,
    bags_sold DECIMAL(10,2) NOT NULL DEFAULT 0,
    price_per_bag DECIMAL(10,2) NOT NULL DEFAULT 0,
    revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
    bank_account VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for date-based queries
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales_records(sale_date);

-- Create index for estate filtering
CREATE INDEX IF NOT EXISTS idx_sales_estate ON sales_records(estate);
