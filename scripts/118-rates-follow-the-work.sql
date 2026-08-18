-- 118: the rate belongs to the work, not to the person.
--
-- WHY. A daily rate on attendance_workers said one person costs one amount whatever they do.
-- The estate's own history says otherwise -- Medappa's entries pay Permanent 600, Shade Lopping
-- 800, Under Lopping 600, Outside 1000 -- and the owner confirmed it directly: the same person is
-- paid differently for weeding than for shade lopping. So the rate is a property of the task.
--
-- Everyone doing the same work is paid the same. Gender is recorded below for INDICOFS reporting
-- and deliberately takes no part in any cost calculation.
--
-- labour_assignments.rate already copies the number onto the row at entry time, so history is
-- safe: changing a code's rate in October cannot rewrite what September cost. Only the source of
-- the default changes.
--
-- EXPAND, NOT CONTRACT. attendance_workers.daily_rate stays for now. Dropping a column and
-- shipping the code that stops reading it in one step leaves nothing to roll back to; it goes in
-- a later migration once the new flow has run on real data.

-- ── The rate a code is normally paid at ────────────────────────────────────────────────────
ALTER TABLE account_activities
  ADD COLUMN IF NOT EXISTS default_rate NUMERIC(12,2) CHECK (default_rate IS NULL OR default_rate >= 0);

COMMENT ON COLUMN account_activities.default_rate IS
  'What this work is normally paid per head per day. Fills the muster in automatically and can be overridden on a single entry -- the entry keeps its own copy, so changing this never rewrites history.';

-- Seed each code from what the estate has actually been paying for it, so nobody starts from a
-- blank rate table. Assignments first (already per-code), then the legacy Accounts entries.
UPDATE account_activities aa
SET default_rate = latest.rate
FROM (
  SELECT DISTINCT ON (tenant_id, activity_code) tenant_id, activity_code, rate
  FROM labour_assignments
  WHERE rate > 0
  ORDER BY tenant_id, activity_code, work_date DESC, created_at DESC
) latest
WHERE aa.tenant_id = latest.tenant_id
  AND aa.code = latest.activity_code
  AND aa.default_rate IS NULL;

UPDATE account_activities aa
SET default_rate = latest.rate
FROM (
  SELECT DISTINCT ON (tenant_id, code) tenant_id, code,
         NULLIF(GREATEST(COALESCE(hf_cost_per_laborer, 0), COALESCE(outside_cost_per_laborer, 0)), 0) AS rate
  FROM labor_transactions
  ORDER BY tenant_id, code, deployment_date DESC
) latest
WHERE aa.tenant_id = latest.tenant_id
  AND aa.code = latest.code
  AND latest.rate IS NOT NULL
  AND aa.default_rate IS NULL;

-- ── Gender, for INDICOFS ───────────────────────────────────────────────────────────────────
ALTER TABLE attendance_workers
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('female', 'male', 'other'));

COMMENT ON COLUMN attendance_workers.gender IS
  'Recorded for INDICOFS reporting only. Never an input to pay -- everyone doing the same work is paid the same rate.';

-- ── A gang day is per head, plus whatever else that day needed ─────────────────────────────
-- Driver, supervisor and vehicle are charged on top of the heads, and change from day to day --
-- send your own car and the vehicle charge is simply absent. Separate columns rather than one
-- lump so "what did supervision cost this season" stays answerable.
ALTER TABLE labour_assignments
  ADD COLUMN IF NOT EXISTS driver_charge     NUMERIC(12,2) CHECK (driver_charge IS NULL OR driver_charge >= 0),
  ADD COLUMN IF NOT EXISTS supervisor_charge NUMERIC(12,2) CHECK (supervisor_charge IS NULL OR supervisor_charge >= 0),
  ADD COLUMN IF NOT EXISTS vehicle_charge    NUMERIC(12,2) CHECK (vehicle_charge IS NULL OR vehicle_charge >= 0);

-- ── Holiday pay ────────────────────────────────────────────────────────────────────────────
-- A holiday pays double for one day's work. Multiplying day_fraction by 2 would have been the
-- easy way and it is wrong: the block would show twice the labourer-days it actually received,
-- and labourer-days per acre is the number INDICOFS and the per-acre analysis both rest on.
-- The money doubles; the day does not.
ALTER TABLE labour_assignments
  ADD COLUMN IF NOT EXISTS pay_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1
    CHECK (pay_multiplier > 0 AND pay_multiplier <= 3);

COMMENT ON COLUMN labour_assignments.pay_multiplier IS
  'Pay rate multiplier -- 1 normally, 2 on a holiday. Kept separate from day_fraction so a holiday doubles the cost without inflating the labour-days a block appears to have consumed.';

-- ── The total has to learn about both ──────────────────────────────────────────────────────
-- A generated column cannot be altered in place, so it is dropped and rebuilt. Values recompute
-- from the columns themselves, so nothing is lost: existing rows have multiplier 1 and no extras
-- and come back with exactly the totals they had.
-- The view reads total_cost, so it has to go first -- Postgres refuses to drop a column another
-- object depends on. It is rebuilt further down, unchanged.
DROP VIEW IF EXISTS labour_cost;

ALTER TABLE labour_assignments DROP COLUMN IF EXISTS total_cost;
ALTER TABLE labour_assignments
  ADD COLUMN total_cost NUMERIC(14,2) GENERATED ALWAYS AS (
    COALESCE(
      lump_sum,
      rate * headcount * day_fraction * pay_multiplier
        + COALESCE(driver_charge, 0)
        + COALESCE(supervisor_charge, 0)
        + COALESCE(vehicle_charge, 0)
    )
  ) STORED;

-- Rebuilt verbatim from 117. Leaving it dropped would take every cost reader in the app down
-- with it, since all of them read this and nothing else.
CREATE OR REPLACE VIEW labour_cost
WITH (security_invoker = true) AS

  -- Legacy: aggregate rows typed into the Accounts labour form.
  SELECT
    lt.tenant_id,
    lt.id::text                                   AS source_id,
    'transaction'::text                           AS source,
    lt.deployment_date                            AS work_date,
    lt.code                                       AS activity_code,
    lt.location_id,
    NULL::uuid                                    AS worker_id,
    COALESCE(lt.hf_laborers, 0)                   AS estate_laborers,
    COALESCE(lt.hf_cost_per_laborer, 0)           AS estate_rate,
    COALESCE(lt.outside_laborers, 0)              AS contract_laborers,
    COALESCE(lt.outside_cost_per_laborer, 0)      AS contract_rate,
    COALESCE(lt.total_cost, 0)                    AS total_cost,
    lt.notes,
    lt.task_description,
    lt.labor_entries,
    lt.recorded_by,
    lt.created_at
  FROM labor_transactions lt
  WHERE NOT EXISTS (
    SELECT 1 FROM tenant_labour_entry_mode m
    WHERE m.tenant_id = lt.tenant_id
      AND lt.deployment_date >= m.assignments_from
  )

  UNION ALL

  -- New: one row per worker per job, from the muster roll.
  SELECT
    a.tenant_id,
    a.id::text                                    AS source_id,
    'assignment'::text                            AS source,
    a.work_date,
    a.activity_code,
    a.location_id,
    a.worker_id,
    -- A named individual is the estate's own labour; a gang is contract. Headcount times the
    -- share of the day, so a half-day by four people reads as two labourer-days, matching what
    -- the legacy columns meant.
    CASE WHEN w.kind = 'gang' THEN 0 ELSE a.headcount * a.day_fraction END  AS estate_laborers,
    CASE WHEN w.kind = 'gang' THEN 0 ELSE a.rate END                        AS estate_rate,
    CASE WHEN w.kind = 'gang' THEN a.headcount * a.day_fraction ELSE 0 END  AS contract_laborers,
    CASE WHEN w.kind = 'gang' THEN a.rate ELSE 0 END                        AS contract_rate,
    a.total_cost,
    a.notes,
    NULL::text                                    AS task_description,
    NULL::jsonb                                   AS labor_entries,
    a.recorded_by,
    a.created_at
  FROM labour_assignments a
  JOIN attendance_workers w
    ON w.id = a.worker_id
   AND w.tenant_id = a.tenant_id
  WHERE EXISTS (
    SELECT 1 FROM tenant_labour_entry_mode m
    WHERE m.tenant_id = a.tenant_id
      AND a.work_date >= m.assignments_from
  );

COMMENT ON VIEW labour_cost IS
  'Unified labour cost. Reads labor_transactions before a tenant''s tenant_labour_entry_mode.assignments_from and labour_assignments on or after it, never both. security_invoker=true so RLS on the underlying tables still applies to app_runtime.';

-- Prove the isolation claim rather than assuming it: a view that silently bypasses RLS would be
-- a cross-tenant data leak, and the failure is invisible from the application side.
DO $$
DECLARE
  invoker BOOLEAN;
BEGIN
  SELECT COALESCE((
    SELECT option_value::boolean
    FROM pg_options_to_table((SELECT reloptions FROM pg_class WHERE relname = 'labour_cost'))
    WHERE option_name = 'security_invoker'
  ), FALSE) INTO invoker;

  IF NOT invoker THEN
    RAISE EXCEPTION 'labour_cost must be security_invoker; without it app_runtime reads every tenant';
  END IF;
END $$;
