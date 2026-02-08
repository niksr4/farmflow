-- Performance indexes for tenant-scoped queries.
CREATE INDEX IF NOT EXISTS idx_labor_transactions_tenant_date
  ON labor_transactions (tenant_id, deployment_date DESC);

CREATE INDEX IF NOT EXISTS idx_expense_transactions_tenant_date
  ON expense_transactions (tenant_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_dispatch_records_tenant_date
  ON dispatch_records (tenant_id, dispatch_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_records_tenant_date
  ON sales_records (tenant_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_processing_records_tenant_date
  ON processing_records (tenant_id, process_date DESC);

CREATE INDEX IF NOT EXISTS idx_transaction_history_tenant_date
  ON transaction_history (tenant_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_tenant_item
  ON current_inventory (tenant_id, item_type);

CREATE INDEX IF NOT EXISTS idx_rainfall_tenant_date
  ON rainfall_records (tenant_id, record_date DESC);
