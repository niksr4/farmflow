-- Billing + GST invoices schema
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  currency TEXT NOT NULL DEFAULT 'INR',
  bill_to_name TEXT NOT NULL,
  bill_to_gstin TEXT,
  bill_to_address TEXT,
  bill_to_state TEXT,
  place_of_supply_state TEXT,
  supply_state TEXT,
  is_inter_state BOOLEAN NOT NULL DEFAULT FALSE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_total NUMERIC NOT NULL DEFAULT 0,
  cgst_amount NUMERIC NOT NULL DEFAULT 0,
  sgst_amount NUMERIC NOT NULL DEFAULT 0,
  igst_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  notes TEXT,
  irn TEXT,
  irn_ack_no TEXT,
  irn_ack_date TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS billing_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hsn TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  line_subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant_date
  ON billing_invoices (tenant_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status
  ON billing_invoices (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_items_invoice
  ON billing_invoice_items (invoice_id);
