-- 123: one definition of what the estate spent, to close the last open half of the P&L.
--
-- WHY NOW. Revenue got this treatment in 121 after pepper turned out to be invisible to six
-- routes. Cost never did: eleven routes each sum expense_transactions themselves, and each
-- decides on its own whether to also add labour_cost, over what date column, with what estate
-- filter. Nothing forces a twelfth to agree with any of them.
--
-- That is not a hypothetical risk, it is the only bug this codebase has produced three times in
-- one week -- money written where some reader cannot see it:
--   * muster allocations by a tenant with no cutover: saved, counted nowhere (fixed)
--   * other_sales_records: six routes blind to Rs 12,12,380 of pepper (fixed by 121)
--   * picking_records: piece-rate pay in no P&L line at all (fixed by 122)
-- Each looked unrelated. Each was one class. A shared helper does not close it -- lib/server/
-- pnl.ts existed the whole time -- because a new route can still write its own SQL. A view can
-- be made the only reachable answer.
--
-- WHAT IS AND IS NOT A COST HERE. Labour and booked expenses. Not inventory movements: stock
-- bought is an asset and stock consumed is already carried by the expense entry that consumed
-- it, so adding either would count the same rupee twice. finance-balance-sheet has always said
-- so in a comment; this puts it in the schema where a new caller cannot miss it.
--
-- kind SPLITS WITHOUT DUPLICATING. Callers that show labour and expenses as separate lines --
-- the balance sheet, the accounts breakdown -- filter on `kind` rather than querying the
-- underlying tables. Same definition, two lines, no second opinion.
--
-- labour_cost IS NOT REPLACED. It stays the source of truth for labour *detail* -- labourer-days,
-- rates, who did what -- which is a different question from what the estate spent, and needs
-- columns an expense row has no answer for. estate_cost reads it rather than re-deriving it.

DROP VIEW IF EXISTS estate_cost;

CREATE VIEW estate_cost
WITH (security_invoker = true) AS

  -- Every form of labour: typed Accounts entries, muster allocations, and piece-rate picking.
  -- Whichever arm of labour_cost a row came from, it is one rupee of labour here.
  SELECT
    lc.tenant_id,
    lc.source_id,
    'labour'::text                    AS kind,
    lc.source,
    lc.work_date                      AS cost_date,
    lc.activity_code,
    lc.location_id,
    COALESCE(lc.total_cost, 0)        AS amount,
    lc.notes,
    lc.created_at
  FROM labour_cost lc

  UNION ALL

  -- Everything else the estate booked as spend.
  SELECT
    et.tenant_id,
    et.id::text                       AS source_id,
    'expense'::text                   AS kind,
    'expense'::text                   AS source,
    et.entry_date                     AS cost_date,
    et.code                           AS activity_code,
    et.location_id,
    COALESCE(et.total_amount, 0)      AS amount,
    et.notes,
    et.created_at
  FROM expense_transactions et;

COMMENT ON VIEW estate_cost IS
  'Every rupee the estate spent: labour (typed, muster, or piece-rate) and booked expenses, under one definition, with kind to split them for display. Inventory movements are deliberately absent -- stock bought is an asset and stock consumed is already carried by its expense row, so including either double counts. Read this rather than expense_transactions or labour_cost when the question is "what did it cost". security_invoker=true so RLS on the underlying tables still applies to app_runtime.';

DO $$
DECLARE
  invoker BOOLEAN;
BEGIN
  SELECT COALESCE((
    SELECT option_value::boolean
    FROM pg_options_to_table((SELECT reloptions FROM pg_class WHERE relname = 'estate_cost'))
    WHERE option_name = 'security_invoker'
  ), FALSE) INTO invoker;

  IF NOT invoker THEN
    RAISE EXCEPTION 'estate_cost must be security_invoker; without it app_runtime reads every tenant';
  END IF;
END $$;

-- The arithmetic has to hold the day it ships, not just be plausible: estate_cost must equal
-- labour_cost plus expense_transactions exactly, for every tenant, or something is being
-- dropped or counted twice by the union itself.
DO $$
DECLARE
  bad RECORD;
BEGIN
  FOR bad IN
    SELECT t.id, t.name,
           (SELECT COALESCE(SUM(amount), 0) FROM estate_cost WHERE tenant_id = t.id)          AS combined,
           (SELECT COALESCE(SUM(total_cost), 0) FROM labour_cost WHERE tenant_id = t.id)
           + (SELECT COALESCE(SUM(total_amount), 0) FROM expense_transactions WHERE tenant_id = t.id) AS parts
    FROM tenants t
  LOOP
    IF ABS(bad.combined - bad.parts) > 0.01 THEN
      RAISE EXCEPTION 'estate_cost disagrees with its own parts for %: view=% parts=%',
        bad.name, bad.combined, bad.parts;
    END IF;
  END LOOP;
END $$;
