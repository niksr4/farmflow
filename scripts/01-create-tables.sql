-- Coffee Inventory Tracker - Neon Database Schema
-- Run this first to create all necessary tables

-- Create inventory transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
    transaction_id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    quantity DECIMAL NOT NULL,
    transaction_type TEXT NOT NULL,
    notes TEXT,
    date TEXT NOT NULL,
    user_id TEXT NOT NULL,
    unit TEXT NOT NULL,
    unit_price DECIMAL,
    total_value DECIMAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_inventory_item_name ON inventory_transactions(item_name);
CREATE INDEX IF NOT EXISTS idx_inventory_date ON inventory_transactions(date);
CREATE INDEX IF NOT EXISTS idx_inventory_created_at ON inventory_transactions(created_at);

-- Create labor and consumables table
CREATE TABLE IF NOT EXISTS labor_consumables (
    transaction_id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('labor', 'consumable')),
    description TEXT,
    amount DECIMAL,
    unit TEXT,
    cost DECIMAL NOT NULL,
    date TEXT NOT NULL,
    reference TEXT,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_labor_consumables_type ON labor_consumables(type);
CREATE INDEX IF NOT EXISTS idx_labor_consumables_date ON labor_consumables(date);
CREATE INDEX IF NOT EXISTS idx_labor_consumables_reference ON labor_consumables(reference);

-- Create a view for current inventory levels
CREATE OR REPLACE VIEW current_inventory AS
SELECT 
    item_name,
    unit,
    SUM(
        CASE 
            WHEN transaction_type = 'Restocking' THEN quantity
            WHEN transaction_type = 'Depleting' THEN -quantity
            WHEN transaction_type = 'Item Deleted' THEN -quantity
            ELSE 0
        END
    ) as current_quantity,
    COUNT(*) as total_transactions,
    MAX(date) as last_transaction_date
FROM inventory_transactions
GROUP BY item_name, unit
HAVING SUM(
    CASE 
        WHEN transaction_type = 'Restocking' THEN quantity
        WHEN transaction_type = 'Depleting' THEN -quantity
        WHEN transaction_type = 'Item Deleted' THEN -quantity
        ELSE 0
    END
) > 0
ORDER BY item_name;

-- Create a view for consumable expenses by category
CREATE OR REPLACE VIEW consumable_expenses_by_category AS
SELECT 
    reference as category_code,
    COUNT(*) as transaction_count,
    SUM(cost) as total_cost,
    MIN(date) as first_transaction,
    MAX(date) as last_transaction
FROM labor_consumables
WHERE type = 'consumable'
GROUP BY reference
ORDER BY total_cost DESC;

-- Create a view for monthly expenses
CREATE OR REPLACE VIEW monthly_expenses AS
SELECT 
    TO_CHAR(TO_DATE(date, 'YYYY-MM-DD'), 'YYYY-MM') as month,
    type,
    COUNT(*) as transaction_count,
    SUM(cost) as total_cost
FROM labor_consumables
GROUP BY TO_CHAR(TO_DATE(date, 'YYYY-MM-DD'), 'YYYY-MM'), type
ORDER BY month DESC, type;

-- Verify tables were created
SELECT 
    table_name, 
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    AND table_name IN ('inventory_transactions', 'labor_consumables');

-- Show the views
SELECT 
    table_name
FROM information_schema.views
WHERE table_schema = 'public';
