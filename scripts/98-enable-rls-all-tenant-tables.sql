-- 98: Enable row-level security on EVERY table that carries a tenant_id column.
--
-- Background: scripts/22-enable-rls.sql applied RLS from a hardcoded table list, so every
-- tenant table added afterwards (buyers, buyer_price_records, certifications,
-- compliance_checklist_items, expense_inventory_links, digest_feedback,
-- tenant_weekly_metrics, agent ops, etc.) shipped with NO row-level policy. This migration
-- makes RLS structural: it discovers tenant tables by column, so new tables are covered the
-- next time it runs, and the companion CI check (scripts/check-rls-coverage.mjs) fails the
-- build if any tenant_id table is left uncovered.
--
-- The policy matches script 22 exactly: the owner (platform) role bypasses; everyone else is
-- confined to rows whose tenant_id equals the app.tenant_id GUC set by lib/tenant-db.ts.
--
-- Idempotent: safe to run repeatedly on both dev and prod.

DO $$
DECLARE
  t_name TEXT;
BEGIN
  FOR t_name IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  LOOP
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
    RAISE NOTICE 'RLS enabled on %', t_name;
  END LOOP;
END $$;
