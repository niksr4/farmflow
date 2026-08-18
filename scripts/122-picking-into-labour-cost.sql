-- 122: piece-rate picking is labour, and no cost total could see it.
--
-- WHY. picking_records pays harvest pickers by weight. It was read by payroll-summary and the
-- balance sheet and by nothing else -- not season-pl, not accounts-totals, not cost-per-kg, not
-- accounts-summary. A season of picking pay would have reached no P&L line at all. That is the
-- same shape as the two faults already found this week: a write path with no reader, where the
-- estate records money, sees a total on screen, and no figure that matters moves.
--
-- It is safe to fix now precisely because nobody has used it: zero picking_records exist across
-- every tenant on production. Wiring it in after a harvest of data exists would mean restating
-- a published P&L.
--
-- LABOURER-DAYS STAY HONEST. A picker paid by the kilo has not worked a countable "labourer
-- day", and labourer-days per acre is what INDICOFS reporting and the per-acre analysis rest on.
-- Migration 118 made the same call for holiday pay: the money doubles, the day does not. So the
-- picking arm contributes its cost and contributes ZERO to estate_laborers/contract_laborers.
-- Adding one would quietly inflate every per-acre figure on the busiest weeks of the year.
--
-- THE CODE. picking_records carries no activity code, so the arm supplies a constant 'PICKING'
-- rather than NULL. NULL would collapse into whatever a GROUP BY activity_code puts unlabelled
-- rows under, next to genuinely uncoded work; a constant is greppable, groups cleanly, and reads
-- correctly in the by-code breakdown without pretending to be one of the estate's own codes.

DROP VIEW IF EXISTS labour_cost;

CREATE VIEW labour_cost
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

  -- Piece rate: paid by the kilo picked, on any day, under either entry method. There is no
  -- cutover clause here on purpose -- picking has always been recorded the same way and is not
  -- part of what the muster replaced, so it counts for every tenant on every date.
  SELECT
    p.tenant_id,
    p.id::text                                    AS source_id,
    'picking'::text                               AS source,
    p.pick_date                                   AS work_date,
    'PICKING'::text                               AS activity_code,
    p.location_id,
    p.worker_id,
    0::numeric                                    AS estate_laborers,
    0::numeric                                    AS estate_rate,
    0::numeric                                    AS contract_laborers,
    0::numeric                                    AS contract_rate,
    ROUND(COALESCE(p.kg_picked, 0) * COALESCE(p.rate_per_kg, 0), 2) AS total_cost,
    p.notes,
    NULL::text                                    AS task_description,
    NULL::jsonb                                   AS labor_entries,
    NULL::text                                    AS recorded_by,
    p.created_at
  FROM picking_records p;

COMMENT ON VIEW labour_cost IS
  'Unified labour cost: typed Accounts entries before a tenant''s tenant_labour_entry_mode.assignments_from, muster allocations on or after it, and piece-rate picking on any date. Picking contributes cost but zero labourer-days, because a kilo is not a day and labourer-days per acre depends on that. security_invoker=true so RLS on the underlying tables still applies to app_runtime.';

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
