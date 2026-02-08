-- Useful Queries for Your Coffee Inventory System
-- Use these to explore and analyze your data

-- 1. Current Inventory Summary
SELECT * FROM current_inventory
ORDER BY current_quantity DESC;

-- 2. Total Expenses by Month
SELECT * FROM monthly_expenses
ORDER BY month DESC;

-- 3. Top 10 Most Expensive Consumables
SELECT 
    reference,
    description,
    cost,
    date,
    user_id
FROM labor_consumables
WHERE type = 'consumable'
ORDER BY cost DESC
LIMIT 10;

-- 4. Items Running Low (less than 10 units)
SELECT 
    item_name,
    current_quantity,
    unit,
    last_transaction_date
FROM current_inventory
WHERE current_quantity < 10
ORDER BY current_quantity ASC;

-- 5. Most Active Users
SELECT 
    user_id,
    COUNT(*) as total_transactions,
    SUM(CASE WHEN type = 'consumable' THEN cost ELSE 0 END) as total_consumable_cost
FROM labor_consumables
GROUP BY user_id
ORDER BY total_transactions DESC;

-- 6. Inventory Activity by Item
SELECT 
    item_name,
    transaction_type,
    COUNT(*) as count,
    SUM(quantity) as total_quantity
FROM inventory_transactions
GROUP BY item_name, transaction_type
ORDER BY item_name, transaction_type;

-- 7. Recent Transactions (Last 30 days)
SELECT 
    transaction_id,
    item_name,
    quantity,
    transaction_type,
    date,
    user_id
FROM inventory_transactions
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 50;

-- 8. Expense Breakdown by Category
SELECT * FROM consumable_expenses_by_category;

-- 9. Find Duplicate Transactions (Quality Check)
SELECT 
    transaction_id,
    COUNT(*) as duplicate_count
FROM labor_consumables
GROUP BY transaction_id
HAVING COUNT(*) > 1;

-- 10. Items with Price Information
SELECT 
    item_name,
    AVG(unit_price) as avg_price,
    MIN(unit_price) as min_price,
    MAX(unit_price) as max_price,
    unit
FROM inventory_transactions
WHERE unit_price IS NOT NULL
GROUP BY item_name, unit
ORDER BY avg_price DESC;

-- 11. Total Value of Current Inventory (if prices available)
SELECT 
    i.item_name,
    i.current_quantity,
    i.unit,
    AVG(t.unit_price) as avg_unit_price,
    i.current_quantity * AVG(t.unit_price) as estimated_value
FROM current_inventory i
LEFT JOIN inventory_transactions t ON i.item_name = t.item_name AND t.unit_price IS NOT NULL
GROUP BY i.item_name, i.current_quantity, i.unit
HAVING AVG(t.unit_price) IS NOT NULL
ORDER BY estimated_value DESC;

-- 12. Daily Activity Report (Last 7 days)
SELECT 
    DATE(created_at) as date,
    COUNT(*) as transactions,
    COUNT(DISTINCT user_id) as active_users
FROM inventory_transactions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
