-- 136: soil test results, which three Level-1 INDICOFS clauses all rest on.
--
-- 4.4.3A  soil analysed at least once every three years, and pH corrective measures IMPLEMENTED
-- 4.4.3B  fertiliser applied on the basis of that analysis
-- 4.5.4E  nitrogen dosing explicitly conditioned on the soil test
--
-- One record answers all three, which is why this is the first thing built after acreage.
--
-- WHY location_id IS NULLABLE, AND IT IS THE IMPORTANT DECISION HERE.
-- The standard analyses the *farm* every three years, not each block. Estates draw a handful of
-- composite samples across the property and send those. Medappa has 21 blocks; nobody sends 21
-- samples. Requiring a block would make people attach a reading to a block it did not come from,
-- which is the same fabrication as copying one rain gauge across 21 blocks -- a guess wearing a
-- measured-looking hat. A test with no block is an estate-level test and reads as exactly that.
--
-- Every value column is nullable too. A lab report is whatever that lab measured: some return pH,
-- OC and NPK and nothing else; micronutrients are often a separate paid panel. Making any of them
-- NOT NULL would force a zero, and a zero in available_k is not "unmeasured", it is "no potassium",
-- which is a different and alarming claim.

CREATE TABLE IF NOT EXISTS soil_tests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- NULL = a farm-level composite. See above.
  location_id         UUID REFERENCES locations(id) ON DELETE SET NULL,

  -- Provenance. Without these a number is an assertion, and 4.4.3A asks for evidence.
  sample_date         DATE NOT NULL,
  lab_name            TEXT,
  report_ref          TEXT,

  -- The three that drive most advice.
  ph                  NUMERIC,
  ec_ds_m             NUMERIC,
  organic_carbon_pct  NUMERIC,

  -- What the Coffee Board recommendation table keys on.
  available_n_kg_ha   NUMERIC,
  available_p_kg_ha   NUMERIC,
  available_k_kg_ha   NUMERIC,

  -- Secondary.
  calcium_ppm         NUMERIC,
  magnesium_ppm       NUMERIC,
  sulphur_ppm         NUMERIC,

  -- Micronutrients. Zinc and boron deficiency is common in Coorg, so these are worth a column
  -- rather than a notes line someone has to read.
  iron_ppm            NUMERIC,
  manganese_ppm       NUMERIC,
  zinc_ppm            NUMERIC,
  copper_ppm          NUMERIC,
  boron_ppm           NUMERIC,

  -- 4.4.3A asks for corrective measures IMPLEMENTED, not merely known. Two fields, because
  -- "we should lime this" and "we limed it on the 4th" are different compliance states and
  -- collapsing them into one text box loses the only part an auditor cares about.
  corrective_action   TEXT,
  action_taken_on     DATE,

  -- The lab report itself. document_records is the existing store; ON DELETE SET NULL so removing
  -- a file does not silently take the readings with it.
  document_id         UUID REFERENCES document_records(id) ON DELETE SET NULL,

  notes               TEXT,
  recorded_by         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- pH outside 3-10 is a typo, not a soil. Same for a percentage above 100. These are the only
  -- constraints worth having: the rest are lab values whose plausible range depends on the method
  -- used, and guessing at those would reject real reports.
  CONSTRAINT soil_tests_ph_range CHECK (ph IS NULL OR (ph >= 3 AND ph <= 10)),
  CONSTRAINT soil_tests_oc_range CHECK (organic_carbon_pct IS NULL OR (organic_carbon_pct >= 0 AND organic_carbon_pct <= 100)),
  -- An action date without an action is a dangling fact; the reverse (planned, not yet done) is
  -- a legitimate state and stays allowed.
  CONSTRAINT soil_tests_action_needs_text CHECK (action_taken_on IS NULL OR corrective_action IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS soil_tests_tenant_date_idx ON soil_tests (tenant_id, sample_date DESC);
CREATE INDEX IF NOT EXISTS soil_tests_location_idx ON soil_tests (location_id) WHERE location_id IS NOT NULL;

-- scripts/98 enables RLS by discovering tables with a tenant_id column, but it ran before this
-- table existed. Enabling it here keeps `pnpm schema:rls` green without a re-run, and matters more
-- than usual: a soil report is the tenant's own paid lab work.
ALTER TABLE soil_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE soil_tests FORCE ROW LEVEL SECURITY;

-- The policy is copied verbatim from scripts/98 -- same name, same expression, including the
-- `app.role = 'owner'` escape the admin paths rely on. Writing a *better* policy here would be the
-- mistake: one table isolating by a different rule than the other fifty is how a table ends up
-- quietly stricter (admin console reads nothing) or quietly looser than everything around it.
-- Note the ::text comparison rather than ::uuid -- current_setting returns '' when unset, and
-- casting that to uuid raises instead of simply matching nothing.
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON soil_tests';
  EXECUTE 'CREATE POLICY tenant_isolation ON soil_tests USING (
             current_setting(''app.role'', true) = ''owner''
             OR tenant_id::text = current_setting(''app.tenant_id'', true)
           ) WITH CHECK (
             current_setting(''app.role'', true) = ''owner''
             OR tenant_id::text = current_setting(''app.tenant_id'', true)
           )';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON soil_tests TO app_runtime;
  END IF;
END $$;

-- Prove the shape rather than assume it. A CREATE TABLE IF NOT EXISTS against a table that already
-- exists in some other shape succeeds silently, which is exactly how a migration lies.
DO $$
DECLARE
  loc_nullable TEXT;
  has_rls BOOLEAN;
BEGIN
  SELECT is_nullable INTO loc_nullable
  FROM information_schema.columns
  WHERE table_name = 'soil_tests' AND column_name = 'location_id';

  IF loc_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION '136: soil_tests.location_id must stay nullable -- a farm-level composite has no block';
  END IF;

  SELECT relrowsecurity INTO has_rls FROM pg_class WHERE relname = 'soil_tests';
  IF NOT has_rls THEN
    RAISE EXCEPTION '136: RLS not enabled on soil_tests';
  END IF;

  -- RLS enabled with no policy denies everything; RLS enabled with the wrong policy is worse.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'soil_tests' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION '136: soil_tests has RLS but no tenant_isolation policy';
  END IF;
END $$;
