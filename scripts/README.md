# Neon Database Setup Instructions

## 📋 Overview

This folder contains all the SQL scripts needed to set up your Coffee Inventory Tracker database directly in Neon PostgreSQL.

## 🚀 Quick Start

### Step 1: Prepare Your Data

1. Rename your files:
   - `accounts.txt` → `accounts.json`
   - `inventory.txt` → `inventory.json`

2. Make sure they contain valid JSON arrays

### Step 2: Generate SQL Scripts

Run the Node.js generator locally:

\`\`\`bash
node generate-sql-inserts.js
\`\`\`

This will create two files:
- `02-import-consumables-full.sql`
- `03-import-inventory-full.sql`

### Step 3: Run in Neon

1. Go to [Neon Console](https://console.neon.tech/)
2. Select your project
3. Open the **SQL Editor**
4. Run the scripts in this order:

#### 3a. Create Tables
\`\`\`sql
-- Copy and paste contents of 01-create-tables.sql
\`\`\`

#### 3b. Import Consumables
\`\`\`sql
-- Copy and paste contents of 02-import-consumables-full.sql
\`\`\`

#### 3c. Import Inventory
\`\`\`sql
-- Copy and paste contents of 03-import-inventory-full.sql
\`\`\`

#### 3d. Verify Data
\`\`\`sql
-- Copy and paste contents of 04-useful-queries.sql
\`\`\`

## 📊 What Gets Created

### Tables

1. **inventory_transactions**
   - Stores all inventory movements (restocking, depleting, etc.)
   - Tracks quantities, prices, and transaction history

2. **labor_consumables**
   - Stores consumable expenses
   - Tracks labor deployments
   - Links to category codes

### Views

1. **current_inventory**
   - Real-time inventory levels
   - Calculated from all transactions

2. **consumable_expenses_by_category**
   - Expense summary by category code
   - Total costs and transaction counts

3. **monthly_expenses**
   - Monthly breakdown of expenses
   - Useful for budgeting and reporting

### Indexes

- Fast lookups by item name
- Fast date-based queries
- Optimized for category searches

## ✅ Verification

After importing, verify your data:

\`\`\`sql
-- Check consumables
SELECT COUNT(*) FROM labor_consumables WHERE type = 'consumable';

-- Check inventory
SELECT COUNT(*) FROM inventory_transactions;

-- View current inventory
SELECT * FROM current_inventory;

-- Check total expenses
SELECT SUM(cost) FROM labor_consumables WHERE type = 'consumable';
\`\`\`

## 🔧 Troubleshooting

### "Syntax error" when running SQL
- Make sure you copied the entire script
- Check for missing semicolons
- Verify quote marks aren't converted by your editor

### "Duplicate key" errors
- The scripts use `ON CONFLICT DO NOTHING`
- This is safe - it means data already exists
- You can run imports multiple times

### Data looks wrong
- Check your JSON files are valid
- Verify dates are in the correct format
- Run the verification queries in step 3d

## 📝 Notes

- All dates are stored as TEXT for compatibility
- Transaction IDs are preserved from original data
- Prices and costs use DECIMAL for accuracy
- User IDs are stored as TEXT

## 🎯 Next Steps

Once data is imported:

1. Connect your app to Neon using `DATABASE_URL`
2. Use the provided views for quick reporting
3. Run the useful queries to explore your data
4. Set up regular backups in Neon dashboard

## 💡 Tips

- Use the SQL Editor's history to save frequently-used queries
- Create additional views for custom reports
- Set up alerts in Neon for database usage
- Consider adding more indexes if queries are slow

## 🧭 Processing Normalization (Multi-tenant)

For multi-tenant estates, processing and pepper data are now normalized into shared tables.

Run these scripts (in order) on the target database:

1. `20-tenant-schema.sql`
2. `25-tenant-settings.sql` (bag weight per estate)
3. `46-ui-preferences.sql` (optional, dashboard UI preferences like hiding empty metrics)
4. `23-normalize-processing.sql`
5. `32-normalize-dispatch-sales.sql` (adds `location_id` to dispatch + sales and backfills from estate labels)
6. `26-lot-traceability.sql` (lot IDs for processing, dispatch, sales)
7. `27-quality-metrics.sql` (moisture + quality fields on processing records)
8. `28-audit-logs.sql` (audit trail table)
9. `21-tenant-constraints.sql`
10. `24-location-aware-inventory-accounts.sql` (optional, if you want inventory + accounts per location)
11. `39-inventory-location-indexes.sql` (optional, enables location-aware inventory without backfilling legacy rows)
12. `29-backfill-tenant-ids.sql` (set tenant_id on legacy rows before enabling RLS)
13. `47-receivables.sql` (optional, add receivables tracking before enabling RLS)
14. `22-enable-rls.sql` (enable row-level security after data is in place)
15. `30-lock-legacy-tables.sql` (optional, prevent writes to deprecated legacy tables)
16. `31-drop-legacy-tables.sql` (optional, permanently remove legacy tables after verification)

New tables:
- `locations`
- `processing_records`
- `pepper_records`
- `tenant_modules`
- `user_modules` (per-user module overrides)

Legacy tables (`hf_arabica`, `hf_robusta`, `mv_robusta`, `pg_robusta`, `hf_pepper`, `mv_pepper`, `pg_pepper`) are kept for reference but should be treated as deprecated once migrated.
Optional hardening: run `30-lock-legacy-tables.sql` to prevent writes to legacy tables after you confirm the app uses the normalized tables.
If you want to permanently remove them, run `31-drop-legacy-tables.sql` after validation/backup.

### RLS Notes

- RLS policies rely on `set_config('app.tenant_id', ...)` and `set_config('app.role', ...)` per request.
- `owner` role bypasses tenant filters; other roles are restricted to their `tenant_id`.
- Run `29-backfill-tenant-ids.sql` to attach legacy rows to the correct tenant before enabling RLS.
