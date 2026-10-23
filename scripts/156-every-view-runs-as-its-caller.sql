-- 156: every view runs as its CALLER, so RLS applies through it
--
-- ⚠ WHY THIS IS A TENANT-ISOLATION FIX AND NOT TIDYING.
--
-- A Postgres view without `security_invoker = true` executes with the privileges of its OWNER.
-- Every view in this schema is owned by `neondb_owner`, which bypasses row level security, and
-- `app_runtime` -- the non-bypass role the application actually connects as -- holds SELECT on all
-- of them. So a view in that state returns EVERY TENANT'S ROWS to a correctly tenant-scoped
-- session, with no error and nothing in any log.
--
-- MEASURED ON PRODUCTION 2026-10-23: four of five views had security_invoker set and
-- `inventory_summary` did not.
--
--     booked_revenue     security_invoker=true
--     estate_cost        security_invoker=true
--     inventory_summary  NOT SET          <-- reads every tenant
--     labour_cost        security_invoker=true
--     rainfall_daily     security_invoker=true
--
-- It was not actively leaking: the only application reader of that view is
-- `lib/tenant-deletion.ts`, an owner-only cleanup path. It was one ordinary
-- `SELECT ... FROM inventory_summary` away from being a live cross-tenant read, and the thing
-- that would normally have caught it could not: `scripts/check-rls-coverage.mjs` filters
-- `table_type = 'BASE TABLE'`, which is right for RLS (a view cannot have RLS) and meant the
-- script printed PASS while being structurally unable to look at a view. Its four siblings were
-- fixed at some point and the fifth was missed, with no guard able to notice. That script now
-- checks views too, derived from pg_class.
--
-- DERIVED, NOT A LIST OF NAMES. A view added tomorrow is covered tomorrow. A hardcoded
-- `ALTER VIEW inventory_summary` would fix exactly today's instance and nothing else, which is
-- how one of five came to be wrong in the first place.
--
-- SAFE TO RE-RUN, and safe on a view that already has the option set.
--
-- ⚠ BEHAVIOURAL CHANGE, STATED PLAINLY: after this, a query against one of these views through
-- `app_runtime` returns only the caller's tenant rows. That is the intent. Any code that was
-- relying -- knowingly or not -- on a view to read across tenants will start seeing fewer rows.
-- The agents in `lib/server/agents/*` are unaffected: they use `adminSql` deliberately and
-- connect as the owner, where RLS does not apply either way.

DO $$
DECLARE
  v record;
  changed int := 0;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v'
      AND n.nspname = 'public'
      AND COALESCE(
            (SELECT option_value FROM pg_options_to_table(c.reloptions)
             WHERE option_name = 'security_invoker'),
            'false'
          ) <> 'true'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.relname);
    RAISE NOTICE 'security_invoker set on view %', v.relname;
    changed := changed + 1;
  END LOOP;

  RAISE NOTICE '156: % view(s) changed', changed;
END $$;

-- Prove it, in the same transaction, rather than trusting the loop above. If any public view is
-- still owner-executing after this, the migration fails instead of recording itself as applied.
DO $$
DECLARE
  leaky text;
BEGIN
  SELECT string_agg(c.relname, ', ')
    INTO leaky
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'v'
    AND n.nspname = 'public'
    AND COALESCE(
          (SELECT option_value FROM pg_options_to_table(c.reloptions)
           WHERE option_name = 'security_invoker'),
          'false'
        ) <> 'true';

  IF leaky IS NOT NULL THEN
    RAISE EXCEPTION '156 did not take: these views still run as their owner: %', leaky;
  END IF;
END $$;
