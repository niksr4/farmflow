-- 153: One spelling per variety and per form, enforced by the database.
--
-- WHAT WENT WRONG. `coffee_type` and `bag_type` are free text with no constraint, and on 2026-10-03
-- HoneyFarm had one sales row and one dispatch row reading 'Dry P' alongside 'Dry Parchment'. That
-- single value meant different things to different readers:
--
--   'Dry P'           a THIRD product category on the sales and dispatch tabs, because their SQL
--                     CASE echoed the raw value in its ELSE
--   NULL              to canonicalizeBagType, which validates writes
--   'Dry Parchment'   to five read paths, which fell through to a default
--
-- and `bagPatternFor` built `LIKE '%parchment%'`, which matched it as neither parchment nor cherry --
-- so those kilos were absent from the stock slot that gates a sale. The estate owned a bag of
-- parchment the app would not let them sell. Nothing threw anywhere.
--
-- lib/crop-config.ts is now the single recogniser and generates the SQL CASE the app groups by, so
-- the application reads 'Dry P' correctly from today. THIS FILE FIXES THE DATA AND THEN STOPS IT
-- COMING BACK, which the application layer cannot do on its own: every future writer would have to
-- remember, and the whole point is that nobody has to.
--
-- SAFETY. Two UPDATEs touching two rows, both rewriting a label to the canonical spelling of the
-- same thing -- no kilo, rupee or date changes. The CHECK constraints are then verified against
-- every existing row before being trusted (the DO block at the bottom aborts if anything is left
-- outside the canonical set), so this cannot half-apply and leave a table nobody can write to.
--
-- WHY EACH CHECK TOLERATES NULL. Verified on dev 2026-10-03: five of these six columns are already
-- NOT NULL (both bag_type columns, and coffee_type on processing/dispatch/sales), so NULL cannot
-- arise there and the clause is inert. Only curing_records.coffee_type is nullable -- curing is an
-- enterprise surface with zero rows on every tenant, and a CHECK that rejected its NULLs would be
-- adding a NOT NULL to a table under the guise of spelling discipline. Writing it this way means the
-- constraint says one thing only: if there IS a value, it is one of the two.
--
-- An earlier draft of this comment justified the NULLs by claiming other_sales_records needs them for
-- pepper. That is wrong and worth recording: the NULL bag_type on a pepper row is synthesised by the
-- booked_revenue VIEW (`NULL::text AS bag_type`), not stored in either of these tables. Pepper never
-- reaches sales_records at all.

-- ── 0. Refuse to touch a value that names BOTH forms ───────────────────────────────────────────
-- A cell reading 'Dry Cherry / Dry Parchment' does not establish which it is. The UPDATEs below run
-- parchment first, so they would silently settle it as parchment -- while parseCoffeeForm in
-- lib/crop-config.ts tested cherry first and would have said cherry. The app and the database
-- disagreeing about the same cell is precisely what this file exists to end, so neither guesses now:
-- the parser returns null and this aborts. Checked BEFORE the UPDATEs, because afterwards the
-- original value is gone and the disagreement is unrecoverable.
DO $$
DECLARE
  ambiguous TEXT;
BEGIN
  SELECT string_agg(DISTINCT v, ', ') INTO ambiguous FROM (
    SELECT bag_type AS v FROM sales_records WHERE bag_type IS NOT NULL
    UNION
    SELECT bag_type FROM dispatch_records WHERE bag_type IS NOT NULL
  ) forms
  WHERE (lower(trim(v)) ~ 'cherry' OR lower(trim(v)) = 'dc')
    AND (lower(trim(v)) ~ 'parch' OR lower(trim(v)) ~ '^dry\s*p$' OR lower(trim(v)) = 'dp');

  IF ambiguous IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 153 stopped: bag_type value(s) (%) name both forms, so no rule can say which they are. Split the rows by hand -- a migration must not decide what a sale was.',
      ambiguous;
  END IF;
END $$;

-- ── 1. Repair the drifted rows ──────────────────────────────────────────────────────────────────
-- Matched on the same rule lib/crop-config.ts uses, so this cannot disagree with the app: anything
-- that means parchment but is not spelled it. 'Dry P' and 'DP' today; written as the pattern rather
-- than as two literals so a third abbreviation in the same shape is caught by the same statement.
UPDATE sales_records
SET bag_type = 'Dry Parchment'
WHERE bag_type IS NOT NULL
  AND bag_type <> 'Dry Parchment'
  AND (lower(trim(bag_type)) ~ 'parch' OR lower(trim(bag_type)) ~ '^dry\s*p$' OR lower(trim(bag_type)) = 'dp');

UPDATE sales_records
SET bag_type = 'Dry Cherry'
WHERE bag_type IS NOT NULL
  AND bag_type <> 'Dry Cherry'
  AND (lower(trim(bag_type)) ~ 'cherry' OR lower(trim(bag_type)) = 'dc');

UPDATE dispatch_records
SET bag_type = 'Dry Parchment'
WHERE bag_type IS NOT NULL
  AND bag_type <> 'Dry Parchment'
  AND (lower(trim(bag_type)) ~ 'parch' OR lower(trim(bag_type)) ~ '^dry\s*p$' OR lower(trim(bag_type)) = 'dp');

UPDATE dispatch_records
SET bag_type = 'Dry Cherry'
WHERE bag_type IS NOT NULL
  AND bag_type <> 'Dry Cherry'
  AND (lower(trim(bag_type)) ~ 'cherry' OR lower(trim(bag_type)) = 'dc');

-- Varieties are already clean on every tenant (only 'Arabica' and 'Robusta' exist), but the same
-- repair runs anyway so this file is correct on a database that is not.
UPDATE processing_records SET coffee_type = 'Arabica'
WHERE coffee_type IS NOT NULL AND coffee_type <> 'Arabica' AND lower(trim(coffee_type)) ~ 'arabica';
UPDATE processing_records SET coffee_type = 'Robusta'
WHERE coffee_type IS NOT NULL AND coffee_type <> 'Robusta' AND lower(trim(coffee_type)) ~ 'robusta';
UPDATE dispatch_records SET coffee_type = 'Arabica'
WHERE coffee_type IS NOT NULL AND coffee_type <> 'Arabica' AND lower(trim(coffee_type)) ~ 'arabica';
UPDATE dispatch_records SET coffee_type = 'Robusta'
WHERE coffee_type IS NOT NULL AND coffee_type <> 'Robusta' AND lower(trim(coffee_type)) ~ 'robusta';
UPDATE sales_records SET coffee_type = 'Arabica'
WHERE coffee_type IS NOT NULL AND coffee_type <> 'Arabica' AND lower(trim(coffee_type)) ~ 'arabica';
UPDATE sales_records SET coffee_type = 'Robusta'
WHERE coffee_type IS NOT NULL AND coffee_type <> 'Robusta' AND lower(trim(coffee_type)) ~ 'robusta';
UPDATE curing_records SET coffee_type = 'Arabica'
WHERE coffee_type IS NOT NULL AND coffee_type <> 'Arabica' AND lower(trim(coffee_type)) ~ 'arabica';
UPDATE curing_records SET coffee_type = 'Robusta'
WHERE coffee_type IS NOT NULL AND coffee_type <> 'Robusta' AND lower(trim(coffee_type)) ~ 'robusta';

-- ── 2. Refuse to go further if anything is still outside the canonical set ──────────────────────
-- A value that is neither NULL nor canonical at this point is NOT an abbreviation this file knows
-- how to read -- it is a spelling nobody anticipated, and guessing at it would be inventing data in
-- somebody's sales ledger. Abort and let a human look, rather than adding a constraint that would
-- then reject every future write to a table whose existing rows already violate it.
DO $$
DECLARE
  bad_forms INTEGER;
  bad_varieties INTEGER;
  detail TEXT;
BEGIN
  SELECT COUNT(*) INTO bad_forms FROM (
    SELECT bag_type FROM sales_records WHERE bag_type IS NOT NULL AND bag_type NOT IN ('Dry Parchment', 'Dry Cherry')
    UNION ALL
    SELECT bag_type FROM dispatch_records WHERE bag_type IS NOT NULL AND bag_type NOT IN ('Dry Parchment', 'Dry Cherry')
  ) unresolved;

  SELECT COUNT(*) INTO bad_varieties FROM (
    SELECT coffee_type FROM processing_records WHERE coffee_type IS NOT NULL AND coffee_type NOT IN ('Arabica', 'Robusta')
    UNION ALL
    SELECT coffee_type FROM dispatch_records WHERE coffee_type IS NOT NULL AND coffee_type NOT IN ('Arabica', 'Robusta')
    UNION ALL
    SELECT coffee_type FROM sales_records WHERE coffee_type IS NOT NULL AND coffee_type NOT IN ('Arabica', 'Robusta')
    UNION ALL
    SELECT coffee_type FROM curing_records WHERE coffee_type IS NOT NULL AND coffee_type NOT IN ('Arabica', 'Robusta')
  ) unresolved;

  IF bad_forms > 0 OR bad_varieties > 0 THEN
    SELECT string_agg(DISTINCT v, ', ') INTO detail FROM (
      SELECT bag_type AS v FROM sales_records WHERE bag_type IS NOT NULL AND bag_type NOT IN ('Dry Parchment', 'Dry Cherry')
      UNION
      SELECT bag_type FROM dispatch_records WHERE bag_type IS NOT NULL AND bag_type NOT IN ('Dry Parchment', 'Dry Cherry')
      UNION
      SELECT coffee_type FROM processing_records WHERE coffee_type IS NOT NULL AND coffee_type NOT IN ('Arabica', 'Robusta')
      UNION
      SELECT coffee_type FROM dispatch_records WHERE coffee_type IS NOT NULL AND coffee_type NOT IN ('Arabica', 'Robusta')
      UNION
      SELECT coffee_type FROM sales_records WHERE coffee_type IS NOT NULL AND coffee_type NOT IN ('Arabica', 'Robusta')
      UNION
      SELECT coffee_type FROM curing_records WHERE coffee_type IS NOT NULL AND coffee_type NOT IN ('Arabica', 'Robusta')
    ) leftovers;

    RAISE EXCEPTION
      'Migration 153 stopped: % bag_type and % coffee_type values are outside the canonical set (%). These are spellings this file does not know how to read. Add them to COFFEE_FORM_PATTERNS / COFFEE_VARIETY_PATTERNS in lib/crop-config.ts and to the UPDATEs above, then re-run -- do not guess at them by hand.',
      bad_forms, bad_varieties, detail;
  END IF;
END $$;

-- ── 3. Lock it ─────────────────────────────────────────────────────────────────────────────────
-- Dropped first so re-running is safe, and named so a failure says which rule was broken.
--
-- ADDED **NOT VALID**, THEN VALIDATED SEPARATELY. A plain ADD CONSTRAINT scans the whole table under
-- ACCESS EXCLUSIVE, blocking reads and writes for the duration; NOT VALID takes the lock only long
-- enough to record the rule, and VALIDATE CONSTRAINT then scans under a weaker lock that readers and
-- writers can share.
--
-- On today's data the difference is unmeasurable -- sales_records has 19 rows, dispatch_records 20,
-- processing_records 78 and curing_records 0, so either form completes in microseconds. It is written
-- this way because the file has to stay correct for the table these become in five seasons, and
-- because NOT VALID still enforces the rule on every NEW write from the moment it lands. The VALIDATE
-- cannot fail: section 2 above has already aborted if any existing row is outside the set.
ALTER TABLE sales_records DROP CONSTRAINT IF EXISTS sales_records_bag_type_canonical;
ALTER TABLE sales_records ADD CONSTRAINT sales_records_bag_type_canonical
  CHECK (bag_type IS NULL OR bag_type IN ('Dry Parchment', 'Dry Cherry')) NOT VALID;
ALTER TABLE sales_records VALIDATE CONSTRAINT sales_records_bag_type_canonical;

ALTER TABLE dispatch_records DROP CONSTRAINT IF EXISTS dispatch_records_bag_type_canonical;
ALTER TABLE dispatch_records ADD CONSTRAINT dispatch_records_bag_type_canonical
  CHECK (bag_type IS NULL OR bag_type IN ('Dry Parchment', 'Dry Cherry')) NOT VALID;
ALTER TABLE dispatch_records VALIDATE CONSTRAINT dispatch_records_bag_type_canonical;

ALTER TABLE processing_records DROP CONSTRAINT IF EXISTS processing_records_coffee_type_canonical;
ALTER TABLE processing_records ADD CONSTRAINT processing_records_coffee_type_canonical
  CHECK (coffee_type IS NULL OR coffee_type IN ('Arabica', 'Robusta')) NOT VALID;
ALTER TABLE processing_records VALIDATE CONSTRAINT processing_records_coffee_type_canonical;

ALTER TABLE dispatch_records DROP CONSTRAINT IF EXISTS dispatch_records_coffee_type_canonical;
ALTER TABLE dispatch_records ADD CONSTRAINT dispatch_records_coffee_type_canonical
  CHECK (coffee_type IS NULL OR coffee_type IN ('Arabica', 'Robusta')) NOT VALID;
ALTER TABLE dispatch_records VALIDATE CONSTRAINT dispatch_records_coffee_type_canonical;

ALTER TABLE sales_records DROP CONSTRAINT IF EXISTS sales_records_coffee_type_canonical;
ALTER TABLE sales_records ADD CONSTRAINT sales_records_coffee_type_canonical
  CHECK (coffee_type IS NULL OR coffee_type IN ('Arabica', 'Robusta')) NOT VALID;
ALTER TABLE sales_records VALIDATE CONSTRAINT sales_records_coffee_type_canonical;

ALTER TABLE curing_records DROP CONSTRAINT IF EXISTS curing_records_coffee_type_canonical;
ALTER TABLE curing_records ADD CONSTRAINT curing_records_coffee_type_canonical
  CHECK (coffee_type IS NULL OR coffee_type IN ('Arabica', 'Robusta')) NOT VALID;
ALTER TABLE curing_records VALIDATE CONSTRAINT curing_records_coffee_type_canonical;

COMMENT ON CONSTRAINT sales_records_bag_type_canonical ON sales_records IS
  'Two forms or NULL. A third spelling becomes a third product line in every report that groups by this column; see lib/crop-config.ts.';
COMMENT ON CONSTRAINT dispatch_records_bag_type_canonical ON dispatch_records IS
  'Two forms or NULL. See lib/crop-config.ts -- one "Dry P" row understated parchment stock and blocked a sale.';
