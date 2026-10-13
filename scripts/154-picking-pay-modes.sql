-- 154: a picking row says HOW it is paid, and the cost view stops assuming.
--
-- WHY. scripts/152 and docs/PICKING-PAYROLL-PLAN.md both rest on one sentence from Manoj:
-- "a field is piece rate OR day wages, never both." HoneyFarm answered the same questions on
-- 2026-10-11 and contradict it:
--
--   permanent checkroll + casual  -- MOST OF THE ROSTER -- day rate PLUS an incentive above a
--                                    threshold, and still weighed
--   arabica early fly picking     -- minimum wage irrespective of quantity, and still weighed
--   assam / outside labour        -- straight per kilo
--   families and contract gangs   -- per kilo, paid as one lump sum to the head
--
-- "Weight is registered against a persons/family name and by the block." The kilos are recorded
-- for EVERYONE, because they are the crop figure and the block yield. What differs is whether
-- those kilos are what the person is paid. Manoj's rule was not wrong, it was local: Medappa pay
-- piece rate, HoneyFarm mostly do not.
--
-- WHAT IT COSTS TODAY, measured rather than assumed. picking_records.rate_per_kg is NOT NULL and
-- the labour_cost view (scripts/122) computes:
--
--     round(COALESCE(p.kg_picked,0) * COALESCE(p.rate_per_kg,0), 2) AS total_cost,
--     0::numeric AS estate_laborers,
--
-- so recording a day-rate picker today does two wrong things, neither of which throws:
--
--   1. THE WAGE NEVER REACHES A COST LINE. Their day rate is multiplied by a per-kg rate that does
--      not exist. Enter 0 and the day costs nothing; enter a fiction and the P&L carries it.
--   2. PER-ACRE LABOUR UNDER-COUNTS IN THE WEEKS IT PEAKS. 122 gives picking zero labourer-days,
--      reasoning correctly that "a kilo is not a day" -- but a DAY-RATE picker has worked a day.
--
-- WHY NOW AND WHY IT IS CHEAP EXACTLY NOW. picking_records still holds ZERO ROWS on dev and prod
-- (verified 2026-10-11, max(pick_date) IS NULL on both). Same free window scripts/152 used, and
-- the same argument: NOT NULL DEFAULT needs no backfill decision and no cost restatement. Arabica
-- is picked October-November. After the first kilo is entered this means reconciling real wage
-- records against a shape they were not written in -- the trap scripts/145 hit when it arrived
-- after HoneyFarm already had 81 worker-days over a day.
--
-- THE DAY BUDGET IS UNCHANGED AND STAYS CORRECT. 152 says a worker has one day shared across
-- picking and day-work. That holds in all three modes: the picking row now CARRIES the day wage,
-- so the writer never needs a second muster entry for the same day. Booking both still raises,
-- which is the right answer.

------------------------------------------------------------------------------------------------
-- 1 · How this row is paid
------------------------------------------------------------------------------------------------

-- 'piece' is what every existing reader already assumes, so it is the default and nothing that
-- exists today changes meaning.
ALTER TABLE picking_records
  ADD COLUMN IF NOT EXISTS pay_mode TEXT NOT NULL DEFAULT 'piece';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picking_records_pay_mode_check') THEN
    ALTER TABLE picking_records
      ADD CONSTRAINT picking_records_pay_mode_check
      CHECK (pay_mode IN ('piece', 'daily', 'daily_plus_incentive'));
  END IF;
END $$;

-- The day wage for THIS row. Defaults from the worker in the route, but is stored per row -- the
-- same discipline as labour_assignments.rate and for the same reason: a rate edited in March must
-- not rewrite what January cost.
ALTER TABLE picking_records
  ADD COLUMN IF NOT EXISTS day_rate NUMERIC(12,2);

-- 1 for an individual, the crew size for a family or contract gang. Mirrors
-- labour_assignments.headcount, including the "copied at entry time" rule, so a crew that changes
-- size in October does not silently rewrite June. Dad: "we will add up the family's picking, pay
-- per kg as a lumpsum for the family, how he pays his family members is not in our control or
-- knowledge" -- so this multiplies a DAY rate and never splits a piece-rate lump sum.
ALTER TABLE picking_records
  ADD COLUMN IF NOT EXISTS headcount INTEGER NOT NULL DEFAULT 1;

-- The incentive, also stored per row. Threshold in kg; the rate applies only ABOVE it.
ALTER TABLE picking_records
  ADD COLUMN IF NOT EXISTS incentive_threshold_kg NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS incentive_rate_per_kg  NUMERIC(10,2);

-- A day-rate row has no per-kg rate, and storing 0 is a lie that computes.
ALTER TABLE picking_records ALTER COLUMN rate_per_kg DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picking_records_day_rate_positive') THEN
    ALTER TABLE picking_records ADD CONSTRAINT picking_records_day_rate_positive
      CHECK (day_rate IS NULL OR day_rate >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picking_records_headcount_positive') THEN
    ALTER TABLE picking_records ADD CONSTRAINT picking_records_headcount_positive
      CHECK (headcount >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picking_records_incentive_sane') THEN
    ALTER TABLE picking_records ADD CONSTRAINT picking_records_incentive_sane
      CHECK (
        (incentive_threshold_kg IS NULL OR incentive_threshold_kg >= 0)
        AND (incentive_rate_per_kg IS NULL OR incentive_rate_per_kg >= 0)
      );
  END IF;

  -- A row cannot be half-specified for its own mode. Without this, 'daily' with a NULL day_rate
  -- costs nothing and says nothing -- the exact silent-zero this migration exists to end.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picking_records_pay_mode_fields') THEN
    ALTER TABLE picking_records ADD CONSTRAINT picking_records_pay_mode_fields
      CHECK (
        CASE pay_mode
          WHEN 'piece' THEN rate_per_kg IS NOT NULL
          WHEN 'daily' THEN day_rate IS NOT NULL
          ELSE day_rate IS NOT NULL
               AND incentive_threshold_kg IS NOT NULL
               AND incentive_rate_per_kg IS NOT NULL
        END
      );
  END IF;
END $$;

------------------------------------------------------------------------------------------------
-- 2 · Ripe and green, where the estate separates them
------------------------------------------------------------------------------------------------
--
-- Dad: "Ripe and green are recorded separately." And, for the other route: "For dry processing /
-- cherry production / unwashed coffee: red and green are not segregated or weighed separately;
-- only total pick is recorded per block."
--
-- NULLABLE, NOT DEFAULTED TO ZERO. A dry-route estate genuinely has no split, and 0/0 would read
-- as "they picked no ripe cherry at all", which is a measurement they never took. Which form the
-- UI asks for comes from the estate's processingRoute (PR #66).
--
-- kg_picked REMAINS THE TOTAL. Every existing reader and the cost view below keep working
-- untouched, and there is exactly one number that means "what this person picked".

ALTER TABLE picking_records
  ADD COLUMN IF NOT EXISTS kg_ripe  NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS kg_green NUMERIC(10,3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picking_records_ripe_green_sum') THEN
    ALTER TABLE picking_records ADD CONSTRAINT picking_records_ripe_green_sum
      CHECK (
        (kg_ripe IS NULL AND kg_green IS NULL)
        OR (
          kg_ripe IS NOT NULL AND kg_green IS NOT NULL
          AND kg_ripe >= 0 AND kg_green >= 0
          -- Tolerance because the two are typed off a field scale and kg_picked is their sum;
          -- exact equality on NUMERIC(10,3) would reject a legitimate rounding at the third place.
          AND ABS((kg_ripe + kg_green) - kg_picked) <= 0.001
        )
      );
  END IF;
END $$;

------------------------------------------------------------------------------------------------
-- 2b · The money, computed once
------------------------------------------------------------------------------------------------
--
-- GENERATED, exactly as labour_assignments.total_cost is (scripts/116), and for the reason stated
-- there: "so the total can never drift from its parts, which is the failure this whole change
-- exists to end."
--
-- Without it this arithmetic would live in three places -- the labour_cost view, the row list in
-- /api/picking-records, and that route's summary SUM -- and the second and third currently read
-- `kg_picked * rate_per_kg`, which is NULL for a day-rate row. Three copies of a formula is the
-- contract-in-two-places shape that has already cost this codebase three silent bugs; the whole
-- point of pay_mode is defeated if a reader can still assume piece rate.
--
-- Every function here is immutable, which GENERATED requires: ROUND, GREATEST, COALESCE and
-- arithmetic. No lookups, so a rate changed on the worker tomorrow cannot reach a row filed today.

ALTER TABLE picking_records
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(14,2)
  GENERATED ALWAYS AS (
    ROUND(
      CASE pay_mode
        WHEN 'piece' THEN COALESCE(kg_picked, 0) * COALESCE(rate_per_kg, 0)
        WHEN 'daily' THEN COALESCE(day_rate, 0) * headcount * day_fraction
        -- ⚠ THE THRESHOLD IS PER PERSON, so it scales with headcount exactly as day_rate does.
        -- Mixing the units silently overpays a crew: a family of 6 picking 300 kg against a 40 kg
        -- threshold at Rs 3 would earn (300 - 40) x 3 = Rs 780 on a per-ROW threshold, where the
        -- estate means (300 - 6x40) x 3 = Rs 180. day_rate is already per-head in the line above,
        -- so a per-row threshold would make one expression speak both languages at once.
        -- Identical for an individual, where headcount is 1.
        ELSE COALESCE(day_rate, 0) * headcount * day_fraction
             + GREATEST(0, COALESCE(kg_picked, 0) - COALESCE(incentive_threshold_kg, 0) * headcount)
               * COALESCE(incentive_rate_per_kg, 0)
      END
    , 2)
  ) STORED;

COMMENT ON COLUMN picking_records.total_cost IS
  'What this row costs, generated from its own parts so no reader can disagree with it. Piece rate is kg x rate; a day rate is day_rate x headcount x day_fraction; the incentive adds a rate on the kilos above the threshold only.';

COMMENT ON COLUMN picking_records.pay_mode IS
  'How this row is paid: piece (kg x rate), daily (day_rate, kilos are the crop figure only), or daily_plus_incentive (day rate plus a rate on kilos above a threshold). All three coexist at one estate in one season.';
COMMENT ON COLUMN picking_records.day_rate IS
  'The day wage for this row, copied from the worker at entry time so a later rate change cannot rewrite what a past day cost.';
COMMENT ON COLUMN picking_records.headcount IS
  'Crew size for a family or contract gang, 1 for an individual. Multiplies a DAY rate only -- a piece-rate lump sum is already the whole crew''s pay.';
COMMENT ON COLUMN picking_records.kg_ripe IS
  'Ripe weight where the estate segregates. NULL on the dry/cherry route, which records only a total -- not zero, because no such measurement was taken.';

------------------------------------------------------------------------------------------------
-- 3 · The cost view learns the three modes
------------------------------------------------------------------------------------------------
--
-- CREATE OR REPLACE, not DROP + CREATE. The column list, names, types and order are all unchanged
-- -- only two expressions differ -- so Postgres accepts a replace, and estate_cost (which SELECTs
-- FROM labour_cost, see scripts/148) does NOT have to come down with it.
--
-- ⚠ security_invoker IS RE-STATED EXPLICITLY and asserted at the bottom. scripts/148 learned this
-- the hard way: a labour_cost rebuilt without it runs as its owner and bypasses RLS, making every
-- tenant's labour cost readable by anybody.
--
-- The first two arms are carried over verbatim from scripts/122. They are reproduced rather than
-- captured with pg_get_viewdef because this migration is CHANGING the third arm, and a captured
-- definition cannot be edited without transcribing it anyway.

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
  )

  UNION ALL

  /**
   * Picking, now mode-aware.
   *
   * COST. One expression per mode, and the CHECK above guarantees the fields each one reads are
   * present, so there is no COALESCE-to-zero hiding a half-filled row:
   *
   *   piece                 kg_picked x rate_per_kg          (unchanged from scripts/122)
   *   daily                 day_rate x headcount x day_fraction
   *   daily_plus_incentive  the same, plus incentive_rate on the kilos ABOVE the threshold
   *
   * The incentive uses GREATEST(0, ...) so a picker who misses the threshold gets the day rate and
   * no negative adjustment. Dad: the threshold "is not yet set and will vary from estate to
   * estate" -- an unset threshold cannot reach this arm, because the CHECK requires it for this
   * mode, so the estate falls back to plain 'daily' rather than to a guessed number.
   *
   * LABOURER-DAYS. scripts/122 set these to zero for all picking, reasoning that "a kilo is not a
   * day" and that labourer-days per acre underpins INDICOFS reporting and the per-acre analysis.
   * That reasoning is exactly right FOR PIECE RATE and exactly wrong for a day rate: somebody paid
   * for a day worked a day. Harvest is when labour per acre peaks, so leaving it at zero
   * under-counts the figure in the weeks it matters most.
   *
   * Counted as ESTATE labourers because the day-rate modes are what HoneyFarm use for permanent
   * checkroll and casual workers. Contract gangs are paid per kilo, which still contributes zero
   * -- the same call scripts/118 made for holiday pay: the money doubles, the day does not.
   */
  SELECT
    p.tenant_id,
    p.id::text                                    AS source_id,
    'picking'::text                               AS source,
    p.pick_date                                   AS work_date,
    'PICKING'::text                               AS activity_code,
    p.location_id,
    p.worker_id,
    -- Gang vs individual split EXACTLY as the assignment arm above does it, rather than a special
    -- case for picking. A contract crew on a day rate is contract labour wherever it is recorded,
    -- and two arms of one view disagreeing about that is how a per-acre figure becomes
    -- unexplainable. In practice the gang branch is quiet -- Dad's gangs are paid per kilo, which
    -- is 'piece' and contributes no labourer-days either way -- but the rule should not depend on
    -- that staying true.
    CASE WHEN p.pay_mode = 'piece' OR w.kind = 'gang' THEN 0
         ELSE p.headcount * p.day_fraction END    AS estate_laborers,
    CASE WHEN p.pay_mode = 'piece' OR w.kind = 'gang' THEN 0
         ELSE COALESCE(p.day_rate, 0) END         AS estate_rate,
    CASE WHEN p.pay_mode <> 'piece' AND w.kind = 'gang' THEN p.headcount * p.day_fraction
         ELSE 0 END                               AS contract_laborers,
    CASE WHEN p.pay_mode <> 'piece' AND w.kind = 'gang' THEN COALESCE(p.day_rate, 0)
         ELSE 0 END                               AS contract_rate,
    -- The generated column, not a copy of its formula. A second transcription here is how the
    -- view and the route start disagreeing about what a day cost.
    p.total_cost                                  AS total_cost,
    p.notes,
    NULL::text                                    AS task_description,
    NULL::jsonb                                   AS labor_entries,
    NULL::text                                    AS recorded_by,
    p.created_at
  FROM picking_records p
  JOIN attendance_workers w
    ON w.id = p.worker_id
   AND w.tenant_id = p.tenant_id;

COMMENT ON VIEW labour_cost IS
  'Unified labour cost: typed Accounts entries before a tenant''s tenant_labour_entry_mode.assignments_from, muster allocations on or after it, and picking on any date. Picking contributes labourer-days only when paid a day rate -- a kilo is not a day, but a day is. security_invoker=true so RLS on the underlying tables still applies to app_runtime.';

------------------------------------------------------------------------------------------------
-- 4 · Prove it, rather than assume it
------------------------------------------------------------------------------------------------

DO $$
DECLARE
  invoker TEXT;
BEGIN
  SELECT COALESCE((
    SELECT option_value
    FROM pg_options_to_table((SELECT reloptions FROM pg_class WHERE relname = 'labour_cost'))
    WHERE option_name = 'security_invoker'
  ), 'false') INTO invoker;

  IF invoker IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'labour_cost lost security_invoker, which would expose every tenant''s labour cost to every other tenant. Refusing to leave it that way.';
  END IF;
END $$;

DO $$
DECLARE
  bad INTEGER;
BEGIN
  -- estate_cost reads labour_cost. If the replace above had broken its shape this would fail here
  -- rather than the first time somebody opens a cost screen.
  IF to_regclass('estate_cost') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM estate_cost' INTO bad;
  END IF;
END $$;
