-- Seed a tenant with mock data for demo/testing.
-- Replace REPLACE_WITH_TENANT_ID before running.

DO $$
DECLARE
  target_tenant_text TEXT := 'REPLACE_WITH_TENANT_ID';
  target_tenant UUID;
BEGIN
  IF target_tenant_text = 'REPLACE_WITH_TENANT_ID' THEN
    RAISE EXCEPTION 'Replace REPLACE_WITH_TENANT_ID with the tenant UUID before running.';
  END IF;

  target_tenant := target_tenant_text::uuid;

-- Account activities
INSERT INTO account_activities (code, activity, tenant_id) VALUES
  ('ADMIN', 'Administrative Expenses', target_tenant),
  ('LABOR', 'Labor Costs', target_tenant),
  ('SUPPLIES', 'Office Supplies', target_tenant),
  ('UTILITIES', 'Utilities', target_tenant),
  ('MAINT', 'Equipment Maintenance', target_tenant),
  ('TRANSPORT', 'Transportation', target_tenant),
  ('MARKETING', 'Marketing and Advertising', target_tenant),
  ('INSURANCE', 'Insurance', target_tenant),
  ('RENT', 'Rent and Facilities', target_tenant),
  ('MISC', 'Miscellaneous Expenses', target_tenant)
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
  ('Urea Fertilizer', 1500, 'restock', 'Pre-season stock received', CURRENT_DATE - INTERVAL '10 days', 'seed', 38, 57000, target_tenant),
  ('NPK 19-19-19', 900, 'restock', 'Nutrient blend stock', CURRENT_DATE - INTERVAL '9 days', 'seed', 62, 55800, target_tenant),
  ('Diesel (L)', 800, 'restock', 'Fuel for transport and generators', CURRENT_DATE - INTERVAL '8 days', 'seed', 95, 76000, target_tenant),
  ('Pesticide (L)', 120, 'restock', 'Pest and disease control stock', CURRENT_DATE - INTERVAL '7 days', 'seed', 480, 57600, target_tenant),
  ('Jute Bags', 400, 'restock', 'Packaging materials', CURRENT_DATE - INTERVAL '6 days', 'seed', 28, 11200, target_tenant),
  ('Urea Fertilizer', 220, 'deplete', 'Block A and B fertilizer application', CURRENT_DATE - INTERVAL '5 days', 'seed', 0, 0, target_tenant),
  ('Diesel (L)', 180, 'deplete', 'Harvest transport and dryer fuel usage', CURRENT_DATE - INTERVAL '3 days', 'seed', 0, 0, target_tenant),
  ('Pesticide (L)', 18, 'deplete', 'Spray cycle completed', CURRENT_DATE - INTERVAL '2 days', 'seed', 0, 0, target_tenant);

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
  (CURRENT_DATE - INTERVAL '12 days', 'LABOR', 12, 450, 3, 500, 6900, 'Harvest team', target_tenant),
  (CURRENT_DATE - INTERVAL '7 days', 'ADMIN', 4, 300, 0, 0, 1200, 'Admin support', target_tenant);

-- Expense transactions
INSERT INTO expense_transactions (
  entry_date,
  code,
  total_amount,
  notes,
  tenant_id
) VALUES
  (CURRENT_DATE - INTERVAL '14 days', 'SUPPLIES', 1800, 'Drying tarps', target_tenant),
  (CURRENT_DATE - INTERVAL '6 days', 'TRANSPORT', 2400, 'Truck fuel', target_tenant),
  (CURRENT_DATE - INTERVAL '3 days', 'MAINT', 950, 'Machine servicing', target_tenant);

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
  (CURRENT_DATE - INTERVAL '5 days', 1200, 5400, 950, 4200, 120, 520, 60, 310, 300, 260, 110, 5, 2, 'Steady ripening', target_tenant)
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
  (CURRENT_DATE - INTERVAL '5 days', 980, 4100, 820, 3500, 90, 420, 55, 250, 260, 210, 90, 4, 2, 'Robusta intake', target_tenant)
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
  (CURRENT_DATE - INTERVAL '5 days', 740, 3000, 600, 2400, 70, 320, 40, 190, 200, 170, 70, 3, 1, 'MV processing', target_tenant)
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
  (CURRENT_DATE - INTERVAL '5 days', 680, 2700, 520, 2100, 60, 280, 35, 170, 180, 150, 60, 3, 1, 'PG processing', target_tenant)
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
  (CURRENT_DATE - INTERVAL '8 days', 420, 320, 76, 100, 24, 'Good drying conditions', 'seed', target_tenant)
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
  (CURRENT_DATE - INTERVAL '8 days', 310, 240, 77, 70, 23, 'Uniform moisture', 'seed', target_tenant)
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
  (CURRENT_DATE - INTERVAL '8 days', 280, 200, 71, 80, 29, 'Drying consistent', 'seed', target_tenant)
ON CONFLICT DO NOTHING;

-- Rainfall records
INSERT INTO rainfall_records (record_date, inches, cents, notes, user_id, tenant_id) VALUES
  (CURRENT_DATE - INTERVAL '9 days', 2, 5, 'Light showers', 'seed', target_tenant),
  (CURRENT_DATE - INTERVAL '2 days', 5, 0, 'Heavy rain', 'seed', target_tenant);

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
  (CURRENT_DATE - INTERVAL '4 days', 'HF A', 'Arabica', 'Dry Parchment', 80, 6200, 'Coastal Buyers', 'First shipment', 'seed', target_tenant),
  (CURRENT_DATE - INTERVAL '1 day', 'HF B', 'Robusta', 'Dry Cherry', 55, 5400, 'Metro Traders', 'Follow-up order', 'seed', target_tenant);

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
  (CURRENT_DATE - INTERVAL '3 days', 'BL-102', 'HF A', 'Arabica', 'Dry Parchment', 4000, 78, 312000, 80, 4000, 60, 6500, 390000, 'HDFC-Primary', 'Partial payment', target_tenant),
  (CURRENT_DATE, 'BL-108', 'HF B', 'Robusta', 'Dry Cherry', 2750, 70, 192500, 55, 2750, 30, 5600, 168000, 'HDFC-Primary', 'Advance received', target_tenant);

END $$;
