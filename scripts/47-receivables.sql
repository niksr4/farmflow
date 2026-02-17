-- Receivables table for buyer invoices and collections tracking.
CREATE TABLE IF NOT EXISTS receivables (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id UUID,
  buyer_name TEXT NOT NULL,
  invoice_no TEXT,
  invoice_date DATE NOT NULL,
  due_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receivables_tenant_date
  ON receivables (tenant_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_receivables_tenant_status
  ON receivables (tenant_id, status);
