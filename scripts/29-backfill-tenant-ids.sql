-- Backfill NULL tenant_id rows to a target tenant.
-- Replace REPLACE_WITH_TENANT_ID before running.

DO $$
DECLARE
  target_tenant_text TEXT := '41b4b10c-428c-4155-882f-1cc7f6e89a78';
  target_tenant UUID;
  t_name TEXT;
  table_list TEXT[] := ARRAY[
    'locations',
    'processing_records',
    'pepper_records',
    'users',
    'tenant_modules',
    'user_modules',
    'audit_logs',
    'account_activities',
    'labor_transactions',
    'expense_transactions',
    'transaction_history',
    'current_inventory',
    'inventory_summary',
    'rainfall_records',
    'dispatch_records',
    'sales_records',
    'other_sales_records',
    'hf_arabica',
    'hf_robusta',
    'mv_robusta',
    'pg_robusta',
    'hf_pepper',
    'mv_pepper',
    'pg_pepper'
  ];
BEGIN
  IF target_tenant_text = 'REPLACE_WITH_TENANT_ID' THEN
    RAISE EXCEPTION 'Replace REPLACE_WITH_TENANT_ID with the main tenant UUID before running.';
  END IF;

  target_tenant := target_tenant_text::uuid;

  FOREACH t_name IN ARRAY table_list LOOP
    IF to_regclass(t_name) IS NOT NULL THEN
      EXECUTE format('UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL', t_name) USING target_tenant;
    END IF;
  END LOOP;
END $$;
