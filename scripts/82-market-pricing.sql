-- Migration 82: Market pricing — buyer CRM and price records

CREATE TABLE IF NOT EXISTS buyers (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  type        TEXT         NOT NULL DEFAULT 'trader', -- cooperative | trader | exporter | processor
  contact_name TEXT,
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buyers_tenant_id_idx ON buyers(tenant_id);

CREATE TABLE IF NOT EXISTS buyer_price_records (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  buyer_id       UUID          REFERENCES buyers(id) ON DELETE SET NULL,
  grade          TEXT,         -- AB, PB, AA, Robusta, etc.
  variety        TEXT,         -- Arabica, Robusta, etc.
  price_per_kg   NUMERIC(10,2) NOT NULL,
  quantity_kg    NUMERIC(10,2),
  record_date    DATE          NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buyer_price_records_tenant_id_idx ON buyer_price_records(tenant_id);
CREATE INDEX IF NOT EXISTS buyer_price_records_buyer_id_idx  ON buyer_price_records(buyer_id);
