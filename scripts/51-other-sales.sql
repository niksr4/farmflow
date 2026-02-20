-- Other sales tracking: non-coffee/side-crop sales with per-kg and contract modes.

CREATE TABLE IF NOT EXISTS other_sales_records (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  sale_date DATE NOT NULL,
  location_id UUID NULL,
  asset_type TEXT NOT NULL,
  sale_mode TEXT NOT NULL,
  kgs_sold NUMERIC(12,2) NULL,
  rate_per_kg NUMERIC(12,2) NULL,
  contract_amount NUMERIC(14,2) NULL,
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  buyer_name TEXT NULL,
  bank_account TEXT NULL,
  notes TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT other_sales_asset_type_check CHECK (
    lower(asset_type) IN ('pepper', 'arecanut', 'avocado', 'coconut', 'other')
  ),
  CONSTRAINT other_sales_sale_mode_check CHECK (
    lower(sale_mode) IN ('per_kg', 'contract')
  ),
  CONSTRAINT other_sales_non_negative_values_check CHECK (
    COALESCE(kgs_sold, 0) >= 0
    AND COALESCE(rate_per_kg, 0) >= 0
    AND COALESCE(contract_amount, 0) >= 0
    AND COALESCE(revenue, 0) >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_other_sales_records_tenant_date
  ON other_sales_records (tenant_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_other_sales_records_tenant_location
  ON other_sales_records (tenant_id, location_id);

DO $$
BEGIN
  IF to_regclass('tenants') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'other_sales_records_tenant_fk')
  THEN
    ALTER TABLE other_sales_records
      ADD CONSTRAINT other_sales_records_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('locations') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'other_sales_records_location_fk')
  THEN
    ALTER TABLE other_sales_records
      ADD CONSTRAINT other_sales_records_location_fk
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE other_sales_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE other_sales_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON other_sales_records;
CREATE POLICY tenant_isolation ON other_sales_records
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );
