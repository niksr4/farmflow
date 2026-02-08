-- Create rainfall records table
CREATE TABLE IF NOT EXISTS rainfall_records (
  id SERIAL PRIMARY KEY,
  record_date DATE NOT NULL,
  inches INTEGER NOT NULL DEFAULT 0,
  cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_id VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_rainfall_date ON rainfall_records(record_date DESC);
