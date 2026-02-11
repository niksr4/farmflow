-- Enable row-level security with tenant isolation policies.
-- Uses current_setting('app.tenant_id', true) from the DB session.

DO $$
DECLARE
  t_name TEXT;
  table_list TEXT[] := ARRAY[
    'locations',
    'processing_records',
    'curing_records',
    'quality_grading_records',
    'pepper_records',
    'users',
    'tenant_modules',
    'user_modules',
    'audit_logs',
    'privacy_requests',
    'security_events',
    'account_activities',
    'labor_transactions',
    'expense_transactions',
    'transaction_history',
    'current_inventory',
    'inventory_summary',
    'rainfall_records',
    'dispatch_records',
    'sales_records',
    'billing_invoices',
    'billing_invoice_items',
    'hf_arabica',
    'hf_robusta',
    'mv_robusta',
    'pg_robusta',
    'hf_pepper',
    'mv_pepper',
    'pg_pepper'
  ];
BEGIN
  FOREACH t_name IN ARRAY table_list LOOP
    IF to_regclass(t_name) IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns cols
        WHERE cols.table_name = t_name AND cols.column_name = 'tenant_id'
      ) THEN
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t_name);
        EXECUTE format(
          'CREATE POLICY tenant_isolation ON %I USING (
             current_setting(''app.role'', true) = ''owner''
             OR tenant_id::text = current_setting(''app.tenant_id'', true)
           ) WITH CHECK (
             current_setting(''app.role'', true) = ''owner''
             OR tenant_id::text = current_setting(''app.tenant_id'', true)
           )',
          t_name
        );
      END IF;
    END IF;
  END LOOP;
END $$;
