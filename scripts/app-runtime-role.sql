-- MANUAL ACTIVATION SCRIPT (not an auto-run migration — deliberately has no NN- prefix so
-- scripts/migrate.mjs never runs it, since it would otherwise create a role with the
-- placeholder password below on every environment).
--
-- Provision the least-privilege, RLS-respecting runtime role for the application (C-1).
--
-- Today the app connects as the schema owner (neondb_owner), which has BYPASSRLS — so the
-- row-level-security policies are inert and tenant isolation rests entirely on every query
-- remembering its tenant_id filter. This script creates a login role that does NOT bypass
-- RLS, so the policies become a real second line of defence.
--
-- ACTIVATION (do this deliberately, not as part of a normal migration run):
--   1. Replace CHANGE_ME below with a strong password (or set it in the Neon console).
--   2. Run this script as the owner against the target database.
--   3. Verify:  node scripts/check-tenant-isolation.mjs  (and  --prod)
--   4. Set APP_DATABASE_URL in the environment to this role's connection string. The app's
--      runtime queries will use it; migrations and self-healing DDL keep using DATABASE_URL
--      (owner). See lib/server/db.ts (sql vs adminSql).
--   5. Roll back instantly by unsetting APP_DATABASE_URL — the app falls back to DATABASE_URL.
--
-- Idempotent except for the password, which is only set on first creation.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    -- NOBYPASSRLS is the whole point: this role is subject to every tenant_isolation policy.
    CREATE ROLE app_runtime LOGIN NOBYPASSRLS NOINHERIT PASSWORD 'CHANGE_ME';
  END IF;
END $$;

DO $$
DECLARE db_name TEXT := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_runtime', db_name);
END $$;

GRANT USAGE ON SCHEMA public TO app_runtime;

-- Runtime DML on all current and future tables. NO DDL, NO ownership — so a forgotten
-- tenant filter is caught by RLS, and a compromised runtime cannot alter the schema.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- The app sets app.tenant_id / app.role via set_config() on every transaction; no special
-- grant is needed for that. Advisory locks (used by the sales stock guard) are available to
-- all roles. Trigger functions run with the invoker's privileges, which app_runtime's DML
-- grants already cover.
