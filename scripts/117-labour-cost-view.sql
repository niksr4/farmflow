-- 117: One place that answers "what did labour cost", whichever way it was entered.
--
-- WHY A VIEW AND NOT A PATCH PER CALLER.
--
-- Labour cost is read in seventeen places: accounts-totals, accounts-summary, season-summary,
-- season-pl, finance-balance-sheet, cost-per-kg, estate-pulse, intelligence-brief, ai-analysis,
-- ai-season-compare, reconciliation, exports/ops, labor-neon, admin/weekly-summary, and the
-- daily, weekly and estate-breakdown digest agents.
--
-- Teaching each of them the cutover rule means seventeen chances to get it wrong, and the
-- eighteenth reader -- written months from now by someone who has never heard of
-- tenant_labour_entry_mode -- would silently report a tenant's labour as zero from the day they
-- switched over. A view puts the rule in one place and makes the correct thing the default.
--
-- THE RULE. A date belongs to exactly one source. Before a tenant's assignments_from it is
-- labor_transactions; on or after it is labour_assignments. A tenant with no row in
-- tenant_labour_entry_mode has not switched, so everything comes from labor_transactions and
-- nothing about their reporting changes. Never both -- a day counted twice is the failure that
-- would corrupt real money while still looking plausible.
--
-- SECURITY. security_invoker = true is load-bearing, not tidiness. Postgres views default to
-- running with the VIEW OWNER's permissions, and this view is created by the migration runner on
-- the owner connection, which bypasses RLS. Without this setting, app_runtime -- the least-
-- privilege role the app actually queries with, and the whole basis of DB-enforced tenant
-- isolation -- would read every tenant's labour through this view. With it, the policies on
-- labor_transactions and labour_assignments still apply to whoever is asking. Requires PG15+;
-- both Neon instances are on 17.
--
-- WORK_DATE IS TIMESTAMPTZ, NOT DATE. labor_transactions.deployment_date is timestamptz and
-- labour_assignments.work_date is a plain date, so the UNION resolves the column to timestamptz
-- and promotes every assignment date to midnight in the session timezone. That is deliberate:
-- it keeps legacy rows behaving exactly as they did before callers were repointed here. Both
-- sides of any comparison promote the same way, and the digests' (work_date AT TIME ZONE
-- 'Asia/Kolkata')::date still lands on the right calendar day under either session timezone.
-- It also means work_date arrives in JS as a Date, not a string -- cast ::text when you need one.
--
-- The estate/contract split finally comes out right, as a side effect. Legacy rows carry it as
-- hf_* versus outside_*, which Medappa fills in wrongly -- every row books as outside labour with
-- in-house 0, including their own permanent staff. Assignment rows derive it from what the worker
-- actually is: an individual is estate labour, a gang is contract.

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
