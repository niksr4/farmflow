-- 134: deleting a block must not be able to take a season of harvest with it.
--
-- A referential audit across all 21 tables carrying location_id found the data itself clean --
-- no orphaned references, none pointing at another tenant's location, no stock outside a store.
-- What it found was the rules, not the rows.
--
-- THE ONE THAT MATTERS. processing_records and pepper_records are ON DELETE CASCADE. Deleting a
-- block would delete every pulping and pepper record ever logged against it -- the single least
-- reconstructible thing an estate owns, since it is measured once at the pulper and never again.
-- app/api/locations DELETE already refuses to remove a location that anything references, so this
-- is not reachable through the app today. It is reachable from psql, from a bulk import, from a
-- future route that forgets, and from anyone who assumes a foreign key means what it usually
-- means. A guard in one route is a convention; RESTRICT is the rule.
--
-- Both columns are NOT NULL, so SET NULL -- what every other data table here uses -- is not
-- available. RESTRICT is the honest equivalent: the delete fails rather than silently doing
-- something drastic or silently doing nothing.
--
-- user_locations stays CASCADE deliberately. It is a permission row, not a record: "this user may
-- see this block" is meaningless once the block is gone, and keeping it would leave a dangling
-- grant. CASCADE is right there and nowhere else in this list.
--
-- transaction_history_archive gets no FK, also deliberately. Archived rows exist precisely to
-- outlive the operational data they came from; a constraint tying them to a live location would
-- defeat the point of archiving. Its 38 rows carry no location anyway.
--
-- The rest are missing a foreign key entirely, which is how an orphan gets created in the first
-- place. All are empty or location-free today, so the constraints go on without touching a row:
-- picking_records is live (core plan), current_inventory_violations is a diagnostic, and curing /
-- quality / receivables are the dormant enterprise tier -- cheap to constrain now, expensive to
-- discover unconstrained later.

-- ── harvest data stops being collateral ─────────────────────────────────────────────────────
ALTER TABLE processing_records DROP CONSTRAINT IF EXISTS processing_records_location_id_fkey;
ALTER TABLE processing_records
  ADD CONSTRAINT processing_records_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT;

ALTER TABLE pepper_records DROP CONSTRAINT IF EXISTS pepper_records_location_id_fkey;
ALTER TABLE pepper_records
  ADD CONSTRAINT pepper_records_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT;

-- ── references that were not references at all ──────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'picking_records',
    'current_inventory_violations',
    'curing_records',
    'quality_grading_records',
    'receivables'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '134: % not present here, skipping', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_location_id_fkey');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL',
      t, t || '_location_id_fkey');
    RAISE NOTICE '134: % .location_id now references locations', t;
  END LOOP;
END $$;

-- ── prove it ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad
  FROM information_schema.referential_constraints rc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
  WHERE kcu.column_name = 'location_id'
    AND kcu.table_name IN ('processing_records', 'pepper_records')
    AND rc.delete_rule <> 'RESTRICT';
  IF bad > 0 THEN
    RAISE EXCEPTION '134: % harvest table(s) still not RESTRICT on location delete', bad;
  END IF;

  SELECT COUNT(*) INTO bad
  FROM information_schema.columns c
  JOIN information_schema.tables tb
    ON tb.table_name = c.table_name AND tb.table_schema = 'public' AND tb.table_type = 'BASE TABLE'
  WHERE c.column_name = 'location_id' AND c.table_schema = 'public'
    AND c.table_name <> 'transaction_history_archive'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.key_column_usage k
      JOIN information_schema.table_constraints tc
        ON tc.constraint_name = k.constraint_name AND tc.constraint_type = 'FOREIGN KEY'
      WHERE k.table_name = c.table_name AND k.column_name = 'location_id'
    );
  IF bad > 0 THEN
    RAISE EXCEPTION '134: % table(s) still carry an unconstrained location_id', bad;
  END IF;
END $$;
