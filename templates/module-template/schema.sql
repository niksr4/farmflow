-- Module schema template
CREATE TABLE IF NOT EXISTS __MODULE_TABLE__ (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  record_date DATE NOT NULL,
  metric_a DECIMAL(10, 2) DEFAULT 0,
  metric_b DECIMAL(10, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, location_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx___MODULE_TABLE___tenant_id ON __MODULE_TABLE__(tenant_id);
CREATE INDEX IF NOT EXISTS idx___MODULE_TABLE___location_id ON __MODULE_TABLE__(location_id);
CREATE INDEX IF NOT EXISTS idx___MODULE_TABLE___record_date ON __MODULE_TABLE__(record_date);
