-- Tenant + user schema baseline for FarmFlow
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bag_weight_kg NUMERIC NOT NULL DEFAULT 50,
  alert_thresholds JSONB DEFAULT '{}'::jsonb,
  ui_preferences JSONB DEFAULT '{}'::jsonb,
  ui_variant TEXT NOT NULL DEFAULT 'standard',
  feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS bag_weight_kg NUMERIC NOT NULL DEFAULT 50;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS alert_thresholds JSONB DEFAULT '{}'::jsonb;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{}'::jsonb;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ui_variant TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_ui_variant_check'
      AND conrelid = 'tenants'::regclass
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_ui_variant_check
      CHECK (ui_variant IN ('standard', 'legacy-estate', 'ops-focused'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
  password_updated_at TIMESTAMP,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'owner')),
  tenant_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'owner'));

CREATE TABLE IF NOT EXISTS tenant_modules (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  module TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module)
);

CREATE TABLE IF NOT EXISTS user_modules (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  module TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, module)
);

-- Add tenant_id columns where missing (keeps existing schema intact).
ALTER TABLE account_activities ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE labor_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE current_inventory ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE inventory_summary ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE rainfall_records ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE hf_arabica ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE hf_robusta ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE mv_robusta ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE pg_robusta ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE hf_pepper ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE mv_pepper ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE pg_pepper ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Helpful tenant indexes.
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_id ON tenant_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_modules_user_id ON user_modules(user_id);
CREATE INDEX IF NOT EXISTS idx_user_modules_tenant_id ON user_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_account_activities_tenant_id ON account_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_labor_transactions_tenant_id ON labor_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expense_transactions_tenant_id ON expense_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_tenant_id ON transaction_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_current_inventory_tenant_id ON current_inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_summary_tenant_id ON inventory_summary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rainfall_records_tenant_id ON rainfall_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_records_tenant_id ON dispatch_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_tenant_id ON sales_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hf_arabica_tenant_id ON hf_arabica(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hf_robusta_tenant_id ON hf_robusta(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mv_robusta_tenant_id ON mv_robusta(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pg_robusta_tenant_id ON pg_robusta(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hf_pepper_tenant_id ON hf_pepper(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mv_pepper_tenant_id ON mv_pepper(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pg_pepper_tenant_id ON pg_pepper(tenant_id);
