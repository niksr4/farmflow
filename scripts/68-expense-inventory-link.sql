-- Link expense entries to inventory items so recording a consumable expense
-- can automatically trigger an inventory depletion, eliminating double-counting.
--
-- inventory_item_type: the item_type from current_inventory / transaction_history
-- inventory_quantity:  how much was consumed (depletion will be recorded at time of expense)

ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS inventory_item_type TEXT;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS inventory_quantity NUMERIC(12, 4);

COMMENT ON COLUMN expense_transactions.inventory_item_type IS 'Optional: links this expense to an inventory item for automatic depletion';
COMMENT ON COLUMN expense_transactions.inventory_quantity IS 'Quantity of inventory_item_type consumed by this expense';

CREATE INDEX IF NOT EXISTS idx_expense_transactions_inventory_item_type
  ON expense_transactions (tenant_id, inventory_item_type)
  WHERE inventory_item_type IS NOT NULL;
