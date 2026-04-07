-- Store every inventory line linked to an expense so multi-item usage survives reload/edit.

CREATE TABLE IF NOT EXISTS expense_inventory_links (
  id SERIAL PRIMARY KEY,
  expense_transaction_id INTEGER NOT NULL,
  tenant_id UUID NOT NULL,
  item_type TEXT NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE expense_inventory_links IS 'Normalized inventory items linked to an expense_transactions row.';
COMMENT ON COLUMN expense_inventory_links.expense_transaction_id IS 'Owning expense_transactions.id row.';
COMMENT ON COLUMN expense_inventory_links.item_type IS 'Normalized inventory item type consumed by the expense.';
COMMENT ON COLUMN expense_inventory_links.quantity IS 'Quantity consumed for item_type.';

CREATE INDEX IF NOT EXISTS idx_expense_inventory_links_expense
  ON expense_inventory_links (tenant_id, expense_transaction_id);

CREATE INDEX IF NOT EXISTS idx_expense_inventory_links_item
  ON expense_inventory_links (tenant_id, item_type);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_inventory_links_expense_item
  ON expense_inventory_links (expense_transaction_id, item_type);

DO $$
BEGIN
  IF to_regclass('public.expense_transactions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'expense_inventory_links_expense_fk'
     ) THEN
    ALTER TABLE expense_inventory_links
      ADD CONSTRAINT expense_inventory_links_expense_fk
      FOREIGN KEY (expense_transaction_id)
      REFERENCES expense_transactions(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'expense_inventory_links_tenant_fk'
     ) THEN
    ALTER TABLE expense_inventory_links
      ADD CONSTRAINT expense_inventory_links_tenant_fk
      FOREIGN KEY (tenant_id)
      REFERENCES tenants(id)
      ON DELETE CASCADE;
  END IF;
END $$;

INSERT INTO expense_inventory_links (
  expense_transaction_id,
  tenant_id,
  item_type,
  quantity
)
SELECT
  et.id,
  et.tenant_id,
  et.inventory_item_type,
  et.inventory_quantity
FROM expense_transactions et
WHERE et.inventory_item_type IS NOT NULL
  AND COALESCE(et.inventory_quantity, 0) > 0
ON CONFLICT (expense_transaction_id, item_type)
DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  quantity = EXCLUDED.quantity;
