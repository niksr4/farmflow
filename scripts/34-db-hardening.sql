-- DB hardening: foreign keys + performance indexes.
-- Run after tenant_id backfill (see 33-tenant-not-null.sql).
-- FK constraints are added as NOT VALID so you can validate after cleanup.

DO $$
BEGIN
  IF to_regclass('tenants') IS NOT NULL AND to_regclass('users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_tenant') THEN
      ALTER TABLE users
        ADD CONSTRAINT fk_users_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('tenants') IS NOT NULL AND to_regclass('locations') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_locations_tenant') THEN
      ALTER TABLE locations
        ADD CONSTRAINT fk_locations_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('tenant_modules') IS NOT NULL AND to_regclass('tenants') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tenant_modules_tenant') THEN
      ALTER TABLE tenant_modules
        ADD CONSTRAINT fk_tenant_modules_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('user_modules') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_modules_tenant') THEN
      ALTER TABLE user_modules
        ADD CONSTRAINT fk_user_modules_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE CASCADE NOT VALID;
    END IF;
    IF to_regclass('users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_modules_user') THEN
      ALTER TABLE user_modules
        ADD CONSTRAINT fk_user_modules_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('account_activities') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_account_activities_tenant') THEN
      ALTER TABLE account_activities
        ADD CONSTRAINT fk_account_activities_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_account_activities_location') THEN
      ALTER TABLE account_activities
        ADD CONSTRAINT fk_account_activities_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('labor_transactions') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_labor_transactions_tenant') THEN
      ALTER TABLE labor_transactions
        ADD CONSTRAINT fk_labor_transactions_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_labor_transactions_location') THEN
      ALTER TABLE labor_transactions
        ADD CONSTRAINT fk_labor_transactions_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('expense_transactions') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_expense_transactions_tenant') THEN
      ALTER TABLE expense_transactions
        ADD CONSTRAINT fk_expense_transactions_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_expense_transactions_location') THEN
      ALTER TABLE expense_transactions
        ADD CONSTRAINT fk_expense_transactions_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('transaction_history') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transaction_history_tenant') THEN
      ALTER TABLE transaction_history
        ADD CONSTRAINT fk_transaction_history_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transaction_history_location') THEN
      ALTER TABLE transaction_history
        ADD CONSTRAINT fk_transaction_history_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transaction_history_user') THEN
      ALTER TABLE transaction_history
        ADD CONSTRAINT fk_transaction_history_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL NOT VALID;
    END IF;
  END IF;

  IF to_regclass('current_inventory') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_current_inventory_tenant') THEN
      ALTER TABLE current_inventory
        ADD CONSTRAINT fk_current_inventory_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_current_inventory_location') THEN
      ALTER TABLE current_inventory
        ADD CONSTRAINT fk_current_inventory_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('inventory_summary') IS NOT NULL AND to_regclass('tenants') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_summary_tenant') THEN
      ALTER TABLE inventory_summary
        ADD CONSTRAINT fk_inventory_summary_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('processing_records') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_processing_records_tenant') THEN
      ALTER TABLE processing_records
        ADD CONSTRAINT fk_processing_records_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_processing_records_location') THEN
      ALTER TABLE processing_records
        ADD CONSTRAINT fk_processing_records_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('curing_records') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_curing_records_tenant') THEN
      ALTER TABLE curing_records
        ADD CONSTRAINT fk_curing_records_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_curing_records_location') THEN
      ALTER TABLE curing_records
        ADD CONSTRAINT fk_curing_records_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('quality_grading_records') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quality_grading_records_tenant') THEN
      ALTER TABLE quality_grading_records
        ADD CONSTRAINT fk_quality_grading_records_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quality_grading_records_location') THEN
      ALTER TABLE quality_grading_records
        ADD CONSTRAINT fk_quality_grading_records_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('pepper_records') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pepper_records_tenant') THEN
      ALTER TABLE pepper_records
        ADD CONSTRAINT fk_pepper_records_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pepper_records_location') THEN
      ALTER TABLE pepper_records
        ADD CONSTRAINT fk_pepper_records_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('rainfall_records') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rainfall_records_tenant') THEN
      ALTER TABLE rainfall_records
        ADD CONSTRAINT fk_rainfall_records_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rainfall_records_user') THEN
      ALTER TABLE rainfall_records
        ADD CONSTRAINT fk_rainfall_records_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL NOT VALID;
    END IF;
  END IF;

  IF to_regclass('dispatch_records') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispatch_records_tenant') THEN
      ALTER TABLE dispatch_records
        ADD CONSTRAINT fk_dispatch_records_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispatch_records_location') THEN
      ALTER TABLE dispatch_records
        ADD CONSTRAINT fk_dispatch_records_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('sales_records') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sales_records_tenant') THEN
      ALTER TABLE sales_records
        ADD CONSTRAINT fk_sales_records_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('locations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sales_records_location') THEN
      ALTER TABLE sales_records
        ADD CONSTRAINT fk_sales_records_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('privacy_requests') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_privacy_requests_tenant') THEN
      ALTER TABLE privacy_requests
        ADD CONSTRAINT fk_privacy_requests_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_privacy_requests_user') THEN
      ALTER TABLE privacy_requests
        ADD CONSTRAINT fk_privacy_requests_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL NOT VALID;
    END IF;
  END IF;

  IF to_regclass('audit_logs') IS NOT NULL THEN
    IF to_regclass('tenants') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_logs_tenant') THEN
      ALTER TABLE audit_logs
        ADD CONSTRAINT fk_audit_logs_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF to_regclass('users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_logs_user') THEN
      ALTER TABLE audit_logs
        ADD CONSTRAINT fk_audit_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL NOT VALID;
    END IF;
  END IF;
END $$;

-- Indexes for common filters and reporting windows.
DO $$
BEGIN
  IF to_regclass('processing_records') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_processing_records_tenant_location_date ON processing_records (tenant_id, location_id, process_date)';
  END IF;
  IF to_regclass('curing_records') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_curing_records_tenant_location_date ON curing_records (tenant_id, location_id, process_date)';
  END IF;
  IF to_regclass('quality_grading_records') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quality_grading_records_tenant_location_date ON quality_grading_records (tenant_id, location_id, grade_date)';
  END IF;
  IF to_regclass('pepper_records') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pepper_records_tenant_location_date ON pepper_records (tenant_id, location_id, process_date)';
  END IF;
  IF to_regclass('dispatch_records') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dispatch_records_tenant_location_date ON dispatch_records (tenant_id, location_id, dispatch_date)';
  END IF;
  IF to_regclass('sales_records') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sales_records_tenant_location_date ON sales_records (tenant_id, location_id, sale_date)';
  END IF;
  IF to_regclass('rainfall_records') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rainfall_records_tenant_date ON rainfall_records (tenant_id, record_date)';
  END IF;
  IF to_regclass('labor_transactions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_labor_transactions_tenant_location_date ON labor_transactions (tenant_id, location_id, deployment_date)';
  END IF;
  IF to_regclass('expense_transactions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_expense_transactions_tenant_location_date ON expense_transactions (tenant_id, location_id, entry_date)';
  END IF;
  IF to_regclass('transaction_history') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transaction_history_tenant_date ON transaction_history (tenant_id, transaction_date)';
  END IF;
  IF to_regclass('account_activities') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_account_activities_tenant_location ON account_activities (tenant_id, location_id)';
  END IF;
  IF to_regclass('audit_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at)';
  END IF;
END $$;
