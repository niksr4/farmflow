-- 111: Per-user location scoping.
--
-- Mirrors user_modules (scripts/20-tenant-schema.sql): tenant_modules/user_modules scope which
-- *modules* a user sees; this table scopes which *locations* within those modules a user may
-- read or write. See lib/location-access.ts for the resolution semantics -- note they
-- deliberately differ from user_modules: user_modules rows are a sparse override (module absent
-- from the table defaults to allowed), but user_locations rows are an allow-list (once ANY row
-- exists for a user, only locations with an enabled=true row are accessible -- otherwise the
-- whole point, constraining a user to a fixed set of blocks, wouldn't hold).
--
-- Zero rows for a user = unrestricted (all tenant locations), so this ships fully backward
-- compatible: no existing tenant/user changes behavior until an owner/admin explicitly assigns
-- rows via the admin console.

CREATE TABLE IF NOT EXISTS user_locations (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  location_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_tenant_id ON user_locations(tenant_id);

-- FK constraints, guarded by pg_constraint existence checks (pattern from
-- scripts/34-db-hardening.sql) so this is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_locations_tenant'
  ) THEN
    ALTER TABLE user_locations
      ADD CONSTRAINT fk_user_locations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_locations_user'
  ) THEN
    ALTER TABLE user_locations
      ADD CONSTRAINT fk_user_locations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_locations_location'
  ) THEN
    ALTER TABLE user_locations
      ADD CONSTRAINT fk_user_locations_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- RLS: this follows scripts/107-rls-backfill-tenant-tables.sql, not bare
-- scripts/98-enable-rls-all-tenant-tables.sql. 98 is a one-time point-in-time sweep that the
-- migration runner will never re-execute (it's already recorded applied), so a table created
-- after it ships with no policy unless a migration adds one explicitly -- exactly what happened
-- to transaction_history_archive for six migrations until 107 caught it. Re-running the same
-- discovery loop here (character-for-character identical to 98/107 -- keep it that way) makes
-- this table self-verifying instead of relying on the next accidental discovery.
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
