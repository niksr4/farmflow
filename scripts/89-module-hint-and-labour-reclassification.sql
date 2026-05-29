-- Migration 89: module_hint on activity codes + reclassify HoneyFarm labour-in-expenses
--
-- Two things:
--   1. Add module_hint column to account_activities so the UI can warn when a
--      labour-type code is selected in the expenses form (and vice versa).
--   2. Move 13 HoneyFarm expense entries that were clearly labour costs into
--      labor_transactions, then remove them from expense_transactions.
--      Affected: Bonus Staff And Labour (103), Arabica Harvesting incentive (144),
--      Leave With Wages (106), and Raju gang contract pruning (152).

BEGIN;

-- ── 1. Add module_hint ────────────────────────────────────────────────────────
ALTER TABLE account_activities
  ADD COLUMN IF NOT EXISTS module_hint VARCHAR(10)
  CHECK (module_hint IN ('labour', 'expense'));

-- Tag labour-only standard codes across all tenants.
-- These codes by definition carry people costs, never material/capital spend.
UPDATE account_activities
SET module_hint = 'labour'
WHERE code IN (
  '101',  -- Salaries And Allowances
  '103',  -- Bonus Staff And Labour
  '104',  -- Gratuity
  '106',  -- Leave With Wages
  '107',  -- ESI / PF Contributions
  '108',  -- Medical Exp Staff, Labour
  '144'   -- Arabica Harvesting incentive
)
AND module_hint IS NULL;

-- Tag expense-only standard codes across all tenants.
-- These codes by definition carry material, capital, or utility costs — not wages.
UPDATE account_activities
SET module_hint = 'expense'
WHERE code IN (
  '112',  -- Vehicle Running & Maint
  '113',  -- Electricity
  '114',  -- Fuel / HSD
  '115',  -- Machinery Maintenance
  '116',  -- Land Tax
  '120',  -- Water Supply
  '122',  -- Miscellaneous
  '233'   -- Capital Account
)
AND module_hint IS NULL;

-- ── 2. Reclassify HoneyFarm entries ──────────────────────────────────────────
-- Move expense_transactions rows that are genuinely labour costs into
-- labor_transactions. Worker-count fields are NULL (lump-sum / contract style).

INSERT INTO labor_transactions (
  deployment_date,
  code,
  total_cost,
  notes,
  tenant_id,
  location_id,
  task_description
)
SELECT
  entry_date,
  code,
  total_amount,
  notes,
  tenant_id,
  location_id,
  'Reclassified from Other Expenses — was logged in wrong tab'
FROM expense_transactions
WHERE id IN (
  -- Code 103: Bonus Staff And Labour, ₹2,81,000 (2026-05-08)
  366,
  -- Code 144: Arabica Harvesting incentive, ₹53,786 (2025-12-12)
  172,
  -- Code 106: Leave With Wages — Gandhi Jayanthi, leave wages, May Day
  21, 265, 309, 355,
  -- Code 152: Raju gang contract pruning (7 entries, Apr–May 2026)
  327, 328, 350, 351, 376, 388, 393
);

-- Remove the originals from expenses
DELETE FROM expense_transactions
WHERE id IN (366, 172, 21, 265, 309, 355, 327, 328, 350, 351, 376, 388, 393);

COMMIT;
