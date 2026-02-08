-- Seed a tenant with mock data for demo/testing.
-- Usage: psql -v tenant_id='YOUR_TENANT_UUID' -f scripts/19-seed-tenant-mock.sql

-- Account activities
INSERT INTO account_activities (code, activity, tenant_id) VALUES
  ('ADMIN', 'Administrative Expenses', :'tenant_id'),
  ('LABOR', 'Labor Costs', :'tenant_id'),
  ('SUPPLIES', 'Office Supplies', :'tenant_id'),
  ('UTILITIES', 'Utilities', :'tenant_id'),
  ('MAINT', 'Equipment Maintenance', :'tenant_id'),
  ('TRANSPORT', 'Transportation', :'tenant_id'),
  ('MARKETING', 'Marketing and Advertising', :'tenant_id'),
  ('INSURANCE', 'Insurance', :'tenant_id'),
  ('RENT', 'Rent and Facilities', :'tenant_id'),
  ('MISC', 'Miscellaneous Expenses', :'tenant_id')
ON CONFLICT DO NOTHING;

-- Inventory transactions (current inventory will be updated via trigger)
INSERT INTO transaction_history (
  item_type,
  quantity,
  transaction_type,
  notes,
  transaction_date,
  user_id,
  price,
  total_cost,
  tenant_id
) VALUES
  ('Arabica Cherry', 1200, 'restock', 'Initial harvest intake', CURRENT_DATE - INTERVAL '10 days', 'seed', 40, 48000, :'tenant_id'),
  ('Robusta Cherry', 900, 'restock', 'Initial harvest intake', CURRENT_DATE - INTERVAL '9 days', 'seed', 32, 28800, :'tenant_id'),
  ('Arabica Cherry', 200, 'deplete', 'Processing loss', CURRENT_DATE - INTERVAL '5 days', 'seed', 0, 0, :'tenant_id'),
  ('Dry Parchment', 300, 'restock', 'Drying output', CURRENT_DATE - INTERVAL '3 days', 'seed', 120, 36000, :'tenant_id');

-- Labor transactions
INSERT INTO labor_transactions (
  deployment_date,
  code,
  hf_laborers,
  hf_cost_per_laborer,
  outside_laborers,
  outside_cost_per_laborer,
  total_cost,
  notes,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '12 days', 'LABOR', 12, 450, 3, 500, 6900, 'Harvest team', :'tenant_id'),
  (CURRENT_DATE - INTERVAL '7 days', 'ADMIN', 4, 300, 0, 0, 1200, 'Admin support', :'tenant_id');

-- Expense transactions
INSERT INTO expense_transactions (
  entry_date,
  code,
  total_amount,
  notes,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '14 days', 'SUPPLIES', 1800, 'Drying tarps', :'tenant_id'),
  (CURRENT_DATE - INTERVAL '6 days', 'TRANSPORT', 2400, 'Truck fuel', :'tenant_id'),
  (CURRENT_DATE - INTERVAL '3 days', 'MAINT', 950, 'Machine servicing', :'tenant_id');

-- Processing records
INSERT INTO hf_arabica (
  process_date,
  crop_today,
  crop_todate,
  ripe_today,
  ripe_todate,
  green_today,
  green_todate,
  float_today,
  float_todate,
  wet_parchment,
  dry_parch,
  dry_cherry,
  dry_p_bags,
  dry_cherry_bags,
  notes,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '5 days', 1200, 5400, 950, 4200, 120, 520, 60, 310, 300, 260, 110, 5, 2, 'Steady ripening', :'tenant_id')
ON CONFLICT DO NOTHING;

INSERT INTO hf_robusta (
  process_date,
  crop_today,
  crop_todate,
  ripe_today,
  ripe_todate,
  green_today,
  green_todate,
  float_today,
  float_todate,
  wet_parchment,
  dry_parch,
  dry_cherry,
  dry_p_bags,
  dry_cherry_bags,
  notes,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '5 days', 980, 4100, 820, 3500, 90, 420, 55, 250, 260, 210, 90, 4, 2, 'Robusta intake', :'tenant_id')
ON CONFLICT DO NOTHING;

INSERT INTO mv_robusta (
  process_date,
  crop_today,
  crop_todate,
  ripe_today,
  ripe_todate,
  green_today,
  green_todate,
  float_today,
  float_todate,
  wet_parchment,
  dry_parch,
  dry_cherry,
  dry_p_bags,
  dry_cherry_bags,
  notes,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '5 days', 740, 3000, 600, 2400, 70, 320, 40, 190, 200, 170, 70, 3, 1, 'MV processing', :'tenant_id')
ON CONFLICT DO NOTHING;

INSERT INTO pg_robusta (
  process_date,
  crop_today,
  crop_todate,
  ripe_today,
  ripe_todate,
  green_today,
  green_todate,
  float_today,
  float_todate,
  wet_parchment,
  dry_parch,
  dry_cherry,
  dry_p_bags,
  dry_cherry_bags,
  notes,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '5 days', 680, 2700, 520, 2100, 60, 280, 35, 170, 180, 150, 60, 3, 1, 'PG processing', :'tenant_id')
ON CONFLICT DO NOTHING;

-- Pepper records
INSERT INTO hf_pepper (
  process_date,
  kg_picked,
  green_pepper,
  green_pepper_percent,
  dry_pepper,
  dry_pepper_percent,
  notes,
  recorded_by,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '8 days', 420, 320, 76, 100, 24, 'Good drying conditions', 'seed', :'tenant_id')
ON CONFLICT DO NOTHING;

INSERT INTO mv_pepper (
  process_date,
  kg_picked,
  green_pepper,
  green_pepper_percent,
  dry_pepper,
  dry_pepper_percent,
  notes,
  recorded_by,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '8 days', 310, 240, 77, 70, 23, 'Uniform moisture', 'seed', :'tenant_id')
ON CONFLICT DO NOTHING;

INSERT INTO pg_pepper (
  process_date,
  kg_picked,
  green_pepper,
  green_pepper_percent,
  dry_pepper,
  dry_pepper_percent,
  notes,
  recorded_by,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '8 days', 280, 200, 71, 80, 29, 'Drying consistent', 'seed', :'tenant_id')
ON CONFLICT DO NOTHING;

-- Rainfall records
INSERT INTO rainfall_records (record_date, inches, cents, notes, user_id, tenant_id) VALUES
  (CURRENT_DATE - INTERVAL '9 days', 2, 5, 'Light showers', 'seed', :'tenant_id'),
  (CURRENT_DATE - INTERVAL '2 days', 5, 0, 'Heavy rain', 'seed', :'tenant_id');

-- Dispatch records
INSERT INTO dispatch_records (
  dispatch_date,
  estate,
  coffee_type,
  bag_type,
  bags_dispatched,
  price_per_bag,
  buyer_name,
  notes,
  created_by,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '4 days', 'HF A', 'Arabica', 'Dry Parchment', 80, 6200, 'Coastal Buyers', 'First shipment', 'seed', :'tenant_id'),
  (CURRENT_DATE - INTERVAL '1 day', 'HF B', 'Robusta', 'Dry Cherry', 55, 5400, 'Metro Traders', 'Follow-up order', 'seed', :'tenant_id');

-- Sales records
INSERT INTO sales_records (
  sale_date,
  batch_no,
  estate,
  coffee_type,
  bag_type,
  weight_kgs,
  price_per_kg,
  total_revenue,
  bags_sent,
  kgs,
  bags_sold,
  price_per_bag,
  revenue,
  bank_account,
  notes,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '3 days', 'BL-102', 'HF A', 'Arabica', 'Dry Parchment', 4000, 78, 312000, 80, 4000, 60, 6500, 390000, 'HDFC-Primary', 'Partial payment', :'tenant_id'),
  (CURRENT_DATE, 'BL-108', 'HF B', 'Robusta', 'Dry Cherry', 2750, 70, 192500, 55, 2750, 30, 5600, 168000, 'HDFC-Primary', 'Advance received', :'tenant_id');
