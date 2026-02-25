-- Document trail for uploads (invoices, dispatch slips, lab reports, weighbridge receipts).
-- Additive only: creates a new tenant-scoped table and indexes/policies.

CREATE TABLE IF NOT EXISTS document_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  location_id UUID NULL,
  document_type TEXT NOT NULL,
  title TEXT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  file_data_base64 TEXT NOT NULL,
  sha256_hex TEXT NOT NULL,
  lot_id TEXT NULL,
  buyer_name TEXT NULL,
  dispatch_record_id BIGINT NULL,
  sales_record_id BIGINT NULL,
  receivable_id BIGINT NULL,
  document_date DATE NULL,
  notes TEXT NULL,
  uploaded_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_records_document_type_check CHECK (
    lower(document_type) IN (
      'invoice',
      'dispatch_slip',
      'buyer_confirmation',
      'weighbridge_slip',
      'lab_report',
      'quality_sheet',
      'other'
    )
  ),
  CONSTRAINT document_records_file_size_check CHECK (
    file_size_bytes > 0
    AND file_size_bytes <= 10485760
  )
);

CREATE INDEX IF NOT EXISTS idx_document_records_tenant_created
  ON document_records (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_records_tenant_type_created
  ON document_records (tenant_id, document_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_records_tenant_location_created
  ON document_records (tenant_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_records_tenant_lot
  ON document_records (tenant_id, lot_id);

CREATE INDEX IF NOT EXISTS idx_document_records_tenant_buyer
  ON document_records (tenant_id, buyer_name);

DO $$
BEGIN
  IF to_regclass('tenants') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_records_tenant_fk')
  THEN
    ALTER TABLE document_records
      ADD CONSTRAINT document_records_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('locations') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_records_location_fk')
  THEN
    ALTER TABLE document_records
      ADD CONSTRAINT document_records_location_fk
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('dispatch_records') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_records_dispatch_fk')
  THEN
    ALTER TABLE document_records
      ADD CONSTRAINT document_records_dispatch_fk
      FOREIGN KEY (dispatch_record_id) REFERENCES dispatch_records(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('sales_records') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_records_sales_fk')
  THEN
    ALTER TABLE document_records
      ADD CONSTRAINT document_records_sales_fk
      FOREIGN KEY (sales_record_id) REFERENCES sales_records(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('receivables') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_records_receivable_fk')
  THEN
    ALTER TABLE document_records
      ADD CONSTRAINT document_records_receivable_fk
      FOREIGN KEY (receivable_id) REFERENCES receivables(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE document_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON document_records;
CREATE POLICY tenant_isolation ON document_records
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );
