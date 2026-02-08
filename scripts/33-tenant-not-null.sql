-- Enforce tenant_id presence after backfilling all nulls.
-- Run ONLY after verifying there are no NULL tenant_id values.

DO $$
DECLARE
  t_name TEXT;
  null_count BIGINT;
  table_list TEXT[] := ARRAY[
    'account_activities',
    'audit_logs',
    'current_inventory',
    'curing_records',
    'dispatch_records',
    'expense_transactions',
    'labor_transactions',
    'locations',
    'pepper_records',
    'processing_records',
    'quality_grading_records',
    'rainfall_records',
    'sales_records',
    'tenant_modules',
    'tenants',
    'transaction_history',
    'user_modules',
    'users'
  ];
BEGIN
  FOREACH t_name IN ARRAY table_list LOOP
    IF to_regclass(t_name) IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns cols
        WHERE cols.table_name = t_name AND cols.column_name = 'tenant_id'
      ) THEN
        EXECUTE format('SELECT COUNT(*) FROM %I WHERE tenant_id IS NULL', t_name) INTO null_count;
        IF null_count = 0 THEN
          EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', t_name);
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;
