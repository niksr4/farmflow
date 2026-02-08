-- Dispatch table for tracking coffee bag sales/dispatches
-- Create this table in a new "Dispatch" database in Neon

CREATE TABLE IF NOT EXISTS dispatch_records (
  id SERIAL PRIMARY KEY,
  dispatch_date DATE NOT NULL,
  estate TEXT NOT NULL, -- HF A, HF B, HF C, MV
  coffee_type TEXT NOT NULL, -- Arabica or Robusta
  bag_type TEXT NOT NULL, -- Dry Parchment or Dry Cherry
  bags_dispatched DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_per_bag DECIMAL(10,2), -- Only admin can set
  buyer_name TEXT, -- Only admin can set
  notes TEXT,
  created_by TEXT DEFAULT 'unknown',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dispatch_date ON dispatch_records(dispatch_date);
CREATE INDEX idx_dispatch_estate ON dispatch_records(estate);
CREATE INDEX idx_dispatch_coffee_type ON dispatch_records(coffee_type);
