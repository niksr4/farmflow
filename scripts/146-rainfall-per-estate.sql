-- 146: Rainfall can be measured per estate, because rain is.
--
-- Asked for by Medappa 2026-09-02: "Can we capture the rainfall for citrus and Tirtha separately?
-- As of now we are capturing the data only for Tirtha on the system and citrus we are recording it
-- manually." Two estates, two rain gauges, one place to put a number.
--
-- THE REAL BLOCKER WAS NOT THE MISSING COLUMN, it was UNIQUE (record_date, tenant_id). Even with
-- somewhere to record the estate, the second reading for a day would have been refused by the
-- database -- so this was never a UI gap. Their 29 records since 27 July all carry no estate and
-- are, as far as the data is concerned, "Medappa": the Tirtha reading is standing in for the whole
-- property, and the Citrus one lives on paper.
--
-- NULL ESTATE STAYS MEANINGFUL AND STAYS THE DEFAULT. An estate that measures rain in one place
-- and calls it the estate's rainfall is not doing anything wrong, and most do. NULL reads as "the
-- whole place" and shows under every estate filter, the same convention every other estate-scoped
-- table follows (lib/estate-filter.ts) -- a record with no estate is never "the other estate's".
--
-- TWO PARTIAL INDEXES, NOT ONE PLAIN ONE.
--
--   UNIQUE (tenant_id, record_date, estate) would let a tenant record the same day twice with a
--   NULL estate, because Postgres treats NULLs as distinct in a unique index. That is precisely
--   the duplicate-per-day the old constraint existed to prevent, quietly reintroduced for every
--   single-estate tenant -- which is all of them today except Medappa and HoneyFarm.
--
-- ⚠ IF YOU EVER ADD ON CONFLICT TO THE RAINFALL ROUTE, THE CONFLICT TARGET MUST REPEAT THE
-- PREDICATE: `(tenant_id, record_date) WHERE estate IS NULL`, not `(tenant_id, record_date)`.
-- Postgres only matches a partial index when the predicate is restated, and the failure is at PLAN
-- time -- "there is no unique or exclusion constraint matching the ON CONFLICT specification". That
-- exact mistake took HoneyFarm's expense logging down on 2026-08-31; see the conflict target in
-- app/api/expenses-neon/route.ts. The route inserts plainly today, so this is a warning, not a bug.

ALTER TABLE rainfall_records ADD COLUMN IF NOT EXISTS estate TEXT;

-- Existing rows keep estate NULL on purpose. Medappa's 29 were measured at Tirtha, but assigning
-- them here would be me deciding that on their behalf from a WhatsApp message -- and a wrong
-- attribution is worse than an honest blank, because "Tirtha got 12 inches" is checkable and
-- "somewhere on the property got 12 inches" is at least true. They have been asked.

-- Constraint first, then the index. The unique index here is OWNED by the constraint, so dropping
-- the index directly fails with "cannot drop index ... because constraint ... requires it" -- and
-- the migration aborts having already added the column, which looks like a half-applied schema.
ALTER TABLE rainfall_records DROP CONSTRAINT IF EXISTS rainfall_records_record_date_tenant_id_key;
DROP INDEX IF EXISTS rainfall_records_record_date_tenant_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS rainfall_one_per_day_whole_estate
  ON rainfall_records (tenant_id, record_date)
  WHERE estate IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rainfall_one_per_day_per_estate
  ON rainfall_records (tenant_id, record_date, estate)
  WHERE estate IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rainfall_tenant_estate_date
  ON rainfall_records (tenant_id, estate, record_date DESC);

-- Prove both halves hold, rather than trusting that CREATE INDEX did what the name says.
DO $$
DECLARE
  whole_estate_idx INTEGER;
  per_estate_idx   INTEGER;
  has_estate       INTEGER;
BEGIN
  SELECT COUNT(*) INTO has_estate FROM information_schema.columns
   WHERE table_name = 'rainfall_records' AND column_name = 'estate';
  IF has_estate = 0 THEN
    RAISE EXCEPTION '146: rainfall_records.estate was not added';
  END IF;

  SELECT COUNT(*) INTO whole_estate_idx FROM pg_indexes
   WHERE tablename = 'rainfall_records' AND indexname = 'rainfall_one_per_day_whole_estate';
  SELECT COUNT(*) INTO per_estate_idx FROM pg_indexes
   WHERE tablename = 'rainfall_records' AND indexname = 'rainfall_one_per_day_per_estate';
  IF whole_estate_idx = 0 OR per_estate_idx = 0 THEN
    RAISE EXCEPTION '146: both partial unique indexes must exist (whole=%, per=%)',
      whole_estate_idx, per_estate_idx;
  END IF;

  -- The old blanket constraint must be gone, or a second estate's reading is still refused and
  -- this whole migration is decoration.
  IF EXISTS (SELECT 1 FROM pg_indexes
              WHERE tablename = 'rainfall_records'
                AND indexname = 'rainfall_records_record_date_tenant_id_key') THEN
    RAISE EXCEPTION '146: the blanket UNIQUE (record_date, tenant_id) is still in place';
  END IF;
END $$;
