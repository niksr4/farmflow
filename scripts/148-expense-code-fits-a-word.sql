-- 148: An expense code can be a word, because the form asks for one.
--
-- HoneyFarm, 2026-09-03, six failed saves in eight minutes:
--   "value too long for type character varying(10)"  (SQLSTATE 22001)
--
-- The expense code field is deliberately free text. components/other-expenses-tab.tsx says so in
-- as many words -- "Expenses allow ad-hoc codes that aren't in the saved list yet" -- and its
-- placeholder reads **"e.g. Fertiliser, Fuel"**. It invites a word. The column was sized for "136".
--
--   Fuel             4  fine
--   Fertiliser      10  fits, barely -- the placeholder's own example is at the limit
--   Transport        9  fine, and already in production data
--   Maintenance     11  REJECTED
--   Electricity     11  REJECTED
--   Calcium Nitrate 15  REJECTED
--
-- So the UI invites exactly the input the schema refuses, and the writer gets "Failed to process
-- expense" with nothing pointing at the code field. Six attempts in eight minutes is somebody
-- retrying with variations, which is what that error message earns.
--
-- WIDENING IS THE FIX, not a maxLength on the input. Ad-hoc word codes are not a misuse to be
-- prevented -- production already holds SUPPLIES and TRANSPORT, and the column is one character
-- from rejecting the latter. Constraining the field would preserve a limit nobody chose: 10 was
-- sized for a numeric code list before free text was allowed, and never revisited.
--
-- All three code columns move together. An ad-hoc expense code becomes a saved activity code
-- later, and labour writes the same vocabulary -- leaving any of them at 10 just relocates the
-- failure to whichever one is touched next.
--
-- 64, not TEXT: long enough for "Calcium Nitrate Application" and short enough that a pasted
-- paragraph is still rejected rather than silently stored as a code.

-- TWO VIEWS READ THESE COLUMNS, so Postgres refuses the ALTER outright: "cannot alter type of a
-- column used by a view or rule". They have to come down and go back up around it.
--
-- Captured with pg_get_viewdef and replayed rather than transcribed. labour_cost is 2,500
-- characters that eight routes depend on; retyping it into a migration to change a column width
-- somewhere else is how a definition quietly drifts from the one that was tested.
--
-- ⚠ BOTH ARE security_invoker = true, and that is NOT carried over by a recreate. A view rebuilt
-- without it runs as its owner, which bypasses RLS -- every tenant's labour and estate costs
-- readable by anybody. It is re-stated explicitly below and asserted at the end.
--
-- Order matters: estate_cost SELECTs FROM labour_cost, so it drops first and is rebuilt last.

DO $$
DECLARE
  estate_def TEXT;
  labour_def TEXT;
BEGIN
  SELECT pg_get_viewdef('estate_cost'::regclass, true) INTO estate_def;
  SELECT pg_get_viewdef('labour_cost'::regclass, true) INTO labour_def;

  DROP VIEW estate_cost;
  DROP VIEW labour_cost;

  -- Widening a varchar rewrites no rows and keeps every index, constraint and foreign key -- the
  -- per-tenant unique on account_activities (script 87) is unaffected.
  ALTER TABLE expense_transactions ALTER COLUMN code TYPE VARCHAR(64);
  ALTER TABLE labor_transactions   ALTER COLUMN code TYPE VARCHAR(64);
  ALTER TABLE account_activities   ALTER COLUMN code TYPE VARCHAR(64);

  EXECUTE 'CREATE VIEW labour_cost WITH (security_invoker = true) AS ' || labour_def;
  EXECUTE 'CREATE VIEW estate_cost WITH (security_invoker = true) AS ' || estate_def;
END $$;

DO $$
DECLARE
  narrow TEXT;
BEGIN
  SELECT string_agg(table_name || '.' || column_name || '(' || character_maximum_length || ')', ', ')
    INTO narrow
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'code'
    AND table_name IN ('expense_transactions', 'labor_transactions', 'account_activities')
    AND character_maximum_length < 64;

  IF narrow IS NOT NULL THEN
    RAISE EXCEPTION '148: these code columns are still too narrow for a word: %', narrow;
  END IF;
END $$;

-- The views must be back, and must still run as the caller. A rebuild that silently drops
-- security_invoker turns a column widening into a cross-tenant data leak.
DO $$
DECLARE
  v TEXT;
  opts TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY['labour_cost', 'estate_cost'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_views WHERE viewname = v) THEN
      RAISE EXCEPTION '148: view % was dropped and not recreated', v;
    END IF;
    SELECT COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                      WHERE option_name = 'security_invoker'), 'false')
      INTO opts
    FROM pg_class c WHERE c.relname = v AND c.relkind = 'v';
    IF opts IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION '148: view % lost security_invoker (got %) -- this is an RLS bypass', v, opts;
    END IF;
  END LOOP;
END $$;
