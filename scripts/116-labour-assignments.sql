-- 116: Record what each worker actually did, and where, on a given day.
--
-- DRAFTED, NOT YET APPLIED. Depends on 115.
--
-- WHY A NEW TABLE RATHER THAN COLUMNS ON attendance_records.
--
-- attendance_records carries a UNIQUE index on (tenant_id, worker_id, attendance_date), and the
-- manual muster save depends on it for ON CONFLICT ... DO NOTHING. One row per worker per day is
-- enforced in the database. So a worker who does two kinds of work, or splits a day across two
-- blocks, cannot be expressed by widening that table -- it would mean dropping an index that six
-- read paths and the biometric ingest rely on.
--
-- It is also the wrong shape conceptually. "Did they turn up" and "what did they do" are
-- different facts at different grains: presence is one per worker per day and can come from a
-- fingerprint terminal; assignment is one per worker per job and only ever comes from a person.
-- Keeping them apart lets the device path stay exactly as it is.
--
-- Entry is still single: both are filled in on one screen, in one pass, by one person. The rule
-- being protected is "no fact is entered twice", not "no fact has its own table".
--
-- COST is generated, never typed. rate x headcount x day_fraction, computed by Postgres, so the
-- stored total cannot drift from its parts -- the failure this whole change exists to end.

CREATE TABLE IF NOT EXISTS labour_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: this is a financial record. Removing a worker must not silently
  -- delete what they were paid. The app soft-deletes (active = FALSE) so this never fires
  -- today, but the day someone adds a hard delete, payroll history would go with it.
  worker_id     UUID NOT NULL REFERENCES attendance_workers(id) ON DELETE RESTRICT,
  work_date     DATE NOT NULL,
  activity_code TEXT NOT NULL,
  -- Nullable on purpose: single-estate tenants have no meaningful block, and forcing one would
  -- make this unusable for the four tenants who are not Medappa. Same always-NULL-shows
  -- convention as every other location-bearing table (lib/estate-filter.ts).
  location_id   UUID REFERENCES locations(id) ON DELETE SET NULL,
  -- 1 = a full standard working day. 0.5 + 0.5 across two rows is a split day.
  --
  -- The ceiling is 2, not 1. INDICOFS 4.6.1B explicitly contemplates overtime ("If extended
  -- work hours are necessary, the grower shall adhere to applicable overtime regulations"), and
  -- a hard cap of one day would make a legitimate long day unrecordable -- which pushes the
  -- estate into writing it somewhere the system cannot see, exactly the free-text habit this
  -- whole change exists to end. Two days' work in one day is still absurd, so that is the wall.
  day_fraction  NUMERIC(4,3) NOT NULL DEFAULT 1 CHECK (day_fraction > 0 AND day_fraction <= 2),
  -- Defaults from the worker but is stored per row: half-days, overtime and gang rates all need
  -- the day's rate, not the profile's.
  rate          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  -- 1 for an individual, the crew size for a gang. Copied from the roster at entry time so a
  -- gang later changing size does not silently rewrite last month's costs.
  headcount     INTEGER NOT NULL DEFAULT 1 CHECK (headcount >= 1),
  -- A job priced as a whole, not per head. Real and live: production holds contract entries of
  -- Rs 70,000, Rs 70,000 and Rs 10,500 stored as {laborCount: 0, costPerLabor: 0,
  -- contractTotal: X}, and the labour form already offers "Add contract". Computing those as
  -- rate x headcount would price all three at zero.
  lump_sum      NUMERIC(14,2) CHECK (lump_sum IS NULL OR lump_sum >= 0),
  -- A lump sum wins when present; otherwise per-head. Generated so the total can never drift
  -- from its parts, which is the failure this whole change exists to end.
  total_cost    NUMERIC(14,2) GENERATED ALWAYS AS (
                  COALESCE(lump_sum, rate * headcount * day_fraction)
                ) STORED,
  notes         TEXT,
  recorded_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deliberately NOT unique on (worker, date, code, location).
--
-- It was, and that blocked a real case: a worker doing a normal day and then overtime on the
-- same task in the same block is two rows differing only by rate. Uniqueness would have forced
-- that into one row at an averaged rate, losing the overtime, or into a fake second block.
--
-- The day-fraction cap below is the constraint that actually protects the money -- you cannot
-- bill more than the ceiling per worker per day however many rows you split it across. Once
-- that holds, uniqueness adds nothing except a wall in front of legitimate splits.
CREATE INDEX IF NOT EXISTS idx_labour_assignments_worker_day
  ON labour_assignments (tenant_id, worker_id, work_date);

CREATE INDEX IF NOT EXISTS idx_labour_assignments_tenant_date
  ON labour_assignments (tenant_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_labour_assignments_tenant_location
  ON labour_assignments (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_labour_assignments_tenant_code
  ON labour_assignments (tenant_id, activity_code);

-- The real integrity guard: a worker's day cannot be billed beyond the ceiling however it is
-- split. Enforced here rather than in the route because getting it wrong is silent over-billing
-- that reconciles against nothing. Lump-sum rows are exempt from the arithmetic below only in
-- the sense that their cost is not derived from the fraction -- they still consume day time.
CREATE OR REPLACE FUNCTION labour_assignments_day_cap() RETURNS TRIGGER AS $$
DECLARE
  used NUMERIC;
  ceiling CONSTANT NUMERIC := 2.0;   -- one standard day plus the same again in overtime
BEGIN
  SELECT COALESCE(SUM(day_fraction), 0) INTO used
  FROM labour_assignments
  WHERE tenant_id = NEW.tenant_id
    AND worker_id = NEW.worker_id
    AND work_date = NEW.work_date
    AND id <> NEW.id;

  IF used + NEW.day_fraction > ceiling + 0.0001 THEN
    RAISE EXCEPTION
      'labour_assignments: worker % is already booked for % of % (ceiling %), cannot add %',
      NEW.worker_id, used, NEW.work_date, ceiling, NEW.day_fraction;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_labour_assignments_day_cap ON labour_assignments;
CREATE TRIGGER trg_labour_assignments_day_cap
  BEFORE INSERT OR UPDATE ON labour_assignments
  FOR EACH ROW EXECUTE FUNCTION labour_assignments_day_cap();

-- ---------------------------------------------------------------------------------------------
-- KNOWN OVERLAP, not solved by schema: picking.
--
-- picking_records already carries worker_id, pick_date, location_id and rate_per_kg -- it is an
-- assignment of a different shape, priced by weight instead of by day. A picker who also gets a
-- labour_assignment for the same day is counted twice in any cost-per-block figure.
--
-- There are no picking records on production at all today (0 rows, all tenants), and Picking
-- only returned to the product on 2026-08-13, so this has never been able to happen yet. It
-- will the moment an estate picks and someone marks the same crew on the muster.
--
-- The fix belongs in the by-block cost query, not here: for any (worker, date) pair, exactly one
-- source owns the cost -- picking_records if a picking row exists, otherwise labour_assignments.
-- Whoever builds that query must write the rule explicitly and test it with a worker who has
-- both on the same day. Long term, picking and labour are the same fact and should merge.
-- ---------------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------------------------
-- The cutover marker. This is the guard against the one failure that would quietly corrupt real
-- money: if a date has both a legacy labor_transactions row and new assignments, any total that
-- reads both counts the day twice -- silently, and in the direction that still looks plausible.
--
-- So a tenant switches over on an explicit date. Before it, labour cost comes from
-- labor_transactions; on and after it, from labour_assignments. Never both, never inferred.
-- Nullable/absent row = tenant has not switched, everything behaves exactly as it does today.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_labour_entry_mode (
  tenant_id       UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  assignments_from DATE NOT NULL,
  set_by          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS. New tenant tables are NOT picked up by scripts 98/107 -- those are point-in-time sweeps
-- already recorded as applied, which is exactly how transaction_history_archive shipped with no
-- policy for six migrations. Policy below is character-for-character the one in 98/107; if the
-- isolation rule ever changes it must change in all three, and a diff between them is a bug.
DO $$
DECLARE
  t_name TEXT;
BEGIN
  FOREACH t_name IN ARRAY ARRAY['labour_assignments', 'tenant_labour_entry_mode'] LOOP
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
  END LOOP;
END $$;

-- Fail loudly rather than record a false success, same reasoning as 107.
DO $$
DECLARE
  uncovered TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO uncovered
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN ('labour_assignments', 'tenant_labour_entry_mode')
    AND (c.relrowsecurity = FALSE OR c.relforcerowsecurity = FALSE);

  IF uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'RLS not fully enabled on: %', uncovered;
  END IF;
END $$;
