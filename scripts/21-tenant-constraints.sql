-- Tenant integrity constraints (only applied when column types are UUID).
-- Neon SQL editor does not support ADD CONSTRAINT IF NOT EXISTS; use pg_constraint guards.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_tenant_fk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tenant_modules' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_modules_tenant_fk'
  ) THEN
    ALTER TABLE tenant_modules
      ADD CONSTRAINT tenant_modules_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_modules' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_modules_tenant_fk'
  ) THEN
    ALTER TABLE user_modules
      ADD CONSTRAINT user_modules_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_modules' AND column_name = 'user_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_modules_user_fk'
  ) THEN
    ALTER TABLE user_modules
      ADD CONSTRAINT user_modules_user_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'locations' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'locations_tenant_fk'
  ) THEN
    ALTER TABLE locations
      ADD CONSTRAINT locations_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'processing_records' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'processing_records_tenant_fk'
  ) THEN
    ALTER TABLE processing_records
      ADD CONSTRAINT processing_records_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pepper_records' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pepper_records_tenant_fk'
  ) THEN
    ALTER TABLE pepper_records
      ADD CONSTRAINT pepper_records_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'account_activities' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_activities_tenant_fk'
  ) THEN
    ALTER TABLE account_activities
      ADD CONSTRAINT account_activities_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'transaction_history' AND column_name = 'location_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transaction_history_location_fk'
  ) THEN
    ALTER TABLE transaction_history
      ADD CONSTRAINT transaction_history_location_fk
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'current_inventory' AND column_name = 'location_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'current_inventory_location_fk'
  ) THEN
    ALTER TABLE current_inventory
      ADD CONSTRAINT current_inventory_location_fk
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'inventory_summary' AND column_name = 'location_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_summary_location_fk'
  ) THEN
    ALTER TABLE inventory_summary
      ADD CONSTRAINT inventory_summary_location_fk
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'labor_transactions' AND column_name = 'location_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'labor_transactions_location_fk'
  ) THEN
    ALTER TABLE labor_transactions
      ADD CONSTRAINT labor_transactions_location_fk
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'expense_transactions' AND column_name = 'location_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_transactions_location_fk'
  ) THEN
    ALTER TABLE expense_transactions
      ADD CONSTRAINT expense_transactions_location_fk
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'account_activities' AND column_name = 'location_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_activities_location_fk'
  ) THEN
    ALTER TABLE account_activities
      ADD CONSTRAINT account_activities_location_fk
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'labor_transactions' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'labor_transactions_tenant_fk'
  ) THEN
    ALTER TABLE labor_transactions
      ADD CONSTRAINT labor_transactions_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'expense_transactions' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_transactions_tenant_fk'
  ) THEN
    ALTER TABLE expense_transactions
      ADD CONSTRAINT expense_transactions_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'transaction_history' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transaction_history_tenant_fk'
  ) THEN
    ALTER TABLE transaction_history
      ADD CONSTRAINT transaction_history_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'current_inventory' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'current_inventory_tenant_fk'
  ) THEN
    ALTER TABLE current_inventory
      ADD CONSTRAINT current_inventory_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'inventory_summary' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_summary_tenant_fk'
  ) THEN
    ALTER TABLE inventory_summary
      ADD CONSTRAINT inventory_summary_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'rainfall_records' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rainfall_records_tenant_fk'
  ) THEN
    ALTER TABLE rainfall_records
      ADD CONSTRAINT rainfall_records_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'dispatch_records' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dispatch_records_tenant_fk'
  ) THEN
    ALTER TABLE dispatch_records
      ADD CONSTRAINT dispatch_records_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'sales_records' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_records_tenant_fk'
  ) THEN
    ALTER TABLE sales_records
      ADD CONSTRAINT sales_records_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'hf_arabica' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hf_arabica_tenant_fk'
  ) THEN
    ALTER TABLE hf_arabica
      ADD CONSTRAINT hf_arabica_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'hf_robusta' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hf_robusta_tenant_fk'
  ) THEN
    ALTER TABLE hf_robusta
      ADD CONSTRAINT hf_robusta_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'mv_robusta' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mv_robusta_tenant_fk'
  ) THEN
    ALTER TABLE mv_robusta
      ADD CONSTRAINT mv_robusta_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pg_robusta' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pg_robusta_tenant_fk'
  ) THEN
    ALTER TABLE pg_robusta
      ADD CONSTRAINT pg_robusta_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'hf_pepper' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hf_pepper_tenant_fk'
  ) THEN
    ALTER TABLE hf_pepper
      ADD CONSTRAINT hf_pepper_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'mv_pepper' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mv_pepper_tenant_fk'
  ) THEN
    ALTER TABLE mv_pepper
      ADD CONSTRAINT mv_pepper_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pg_pepper' AND column_name = 'tenant_id' AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pg_pepper_tenant_fk'
  ) THEN
    ALTER TABLE pg_pepper
      ADD CONSTRAINT pg_pepper_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;
