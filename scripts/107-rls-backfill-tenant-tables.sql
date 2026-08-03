-- 107: Re-run the RLS discovery loop to cover tenant tables created after script 98.
--
-- Why this exists, and why it is not just "98 again":
--
-- scripts/98-enable-rls-all-tenant-tables.sql discovers tenant tables by column and enables RLS
-- on each. That is structural at the moment it runs, but it is still a POINT-IN-TIME sweep: any
-- table created by a later migration is not covered, and because 98 is already recorded in
-- schema_migrations the runner will never execute it again to pick those tables up.
--
-- That is exactly what happened. scripts/104-honeyfarm-ledger-reset.sql created
-- transaction_history_archive — which carries tenant_id and holds 38 rows of real archived
-- ledger data on prod — six migrations after 98 had run. It shipped to both dev and prod with
-- no row-level policy at all, and app_runtime holds full DML on it. Found 2026-08-02 by
-- `pnpm schema:rls:prod`, which had been failing unnoticed because that check is not wired into
-- CI (this migration is landing alongside that CI change).
--
-- The loop below is character-for-character the policy from 98. Keep them identical: if the
-- isolation rule ever changes, it must change in both places, and a diff between them is a bug.
--
-- Idempotent: safe to run repeatedly on both dev and prod. Tables that already have the policy
-- are dropped and recreated with the same definition inside this single transaction.

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

-- Fail the migration rather than record a false success if anything is still uncovered.
-- Without this the runner would mark 107 applied even if the loop silently matched nothing,
-- which is the failure mode that let the original gap persist for six migrations.
DO $$
DECLARE
  uncovered TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
  INTO uncovered
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = c.relname
        AND col.column_name = 'tenant_id'
    )
    AND (c.relrowsecurity = FALSE OR c.relforcerowsecurity = FALSE);

  IF uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'RLS backfill incomplete; still uncovered: %', uncovered;
  END IF;
END $$;
