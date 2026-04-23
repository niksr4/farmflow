-- Migration 83: Compliance — certification tracker and checklist items

CREATE TABLE IF NOT EXISTS certifications (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  certification_type  TEXT        NOT NULL DEFAULT 'custom',
  -- rainforest_alliance | utz | fair_trade | organic_india | coffee_board | custom
  issuing_body        TEXT,
  certificate_number  TEXT,
  valid_from          DATE,
  valid_until         DATE,
  status              TEXT        NOT NULL DEFAULT 'active',
  -- active | expired | pending | suspended
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS certifications_tenant_id_idx ON certifications(tenant_id);

CREATE TABLE IF NOT EXISTS compliance_checklist_items (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  certification_id  UUID        REFERENCES certifications(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL,
  description       TEXT,
  due_date          DATE,
  completed_at      TIMESTAMPTZ,
  completed_by      TEXT,
  status            TEXT        NOT NULL DEFAULT 'pending',
  -- pending | completed | overdue | not_applicable
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_checklist_items_tenant_id_idx       ON compliance_checklist_items(tenant_id);
CREATE INDEX IF NOT EXISTS compliance_checklist_items_certification_id_idx ON compliance_checklist_items(certification_id);
