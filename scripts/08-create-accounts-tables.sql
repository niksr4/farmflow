-- Create account_activities table
CREATE TABLE IF NOT EXISTS account_activities (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  activity TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create labor_deployments table
CREATE TABLE IF NOT EXISTS labor_deployments (
  id SERIAL PRIMARY KEY,
  deployment_date DATE NOT NULL,
  code VARCHAR(50) NOT NULL,
  hf_laborers INTEGER NOT NULL DEFAULT 0,
  hf_cost_per_laborer DECIMAL(10, 2) NOT NULL DEFAULT 0,
  outside_laborers INTEGER NOT NULL DEFAULT 0,
  outside_cost_per_laborer DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (code) REFERENCES account_activities(code)
);

-- Create other_expenses table
CREATE TABLE IF NOT EXISTS other_expenses (
  id SERIAL PRIMARY KEY,
  entry_date DATE NOT NULL,
  code VARCHAR(50) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (code) REFERENCES account_activities(code)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_labor_deployments_date ON labor_deployments(deployment_date);
CREATE INDEX IF NOT EXISTS idx_labor_deployments_code ON labor_deployments(code);
CREATE INDEX IF NOT EXISTS idx_other_expenses_date ON other_expenses(entry_date);
CREATE INDEX IF NOT EXISTS idx_other_expenses_code ON other_expenses(code);

-- Insert sample activity codes if the table is empty
INSERT INTO account_activities (code, activity) VALUES
  ('ADMIN', 'Administrative Expenses'),
  ('LABOR', 'Labor Costs'),
  ('SUPPLIES', 'Office Supplies'),
  ('UTILITIES', 'Utilities'),
  ('MAINTENANCE', 'Equipment Maintenance'),
  ('TRANSPORT', 'Transportation'),
  ('MARKETING', 'Marketing and Advertising'),
  ('INSURANCE', 'Insurance'),
  ('RENT', 'Rent and Facilities'),
  ('MISC', 'Miscellaneous Expenses')
ON CONFLICT (code) DO NOTHING;
