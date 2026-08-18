-- 121: one definition of what the estate sold, for the same reason 117 gave labour one.
--
-- WHY. Revenue is recorded in two tables -- sales_records for coffee, other_sales_records for
-- pepper and anything else sold outside the main flow -- and eleven routes each wrote their own
-- query over them. Six read only sales_records, so HoneyFarm's Rs 12,12,380 of pepper (a per-kg
-- sale of Rs 5,12,380 and a Rs 7,00,000 contract, both dated 2026-03-18) was invisible to the
-- P&L tab, cost-per-kg, estate pulse, the intelligence brief, the season summary and the
-- year-on-year comparison. The balance sheet and the ops export saw it; nothing else did. Open
-- two tabs and the same estate had two different revenues.
--
-- This is not a new failure. lib/server/pnl.ts exists *because* the export had already dropped
-- other_sales_records once. That fix was applied to two callers and never to the rest, which is
-- what a shared function buys you when six people can still write their own SQL. A view is not
-- optional discipline -- there is no way to read revenue and not go through it.
--
-- WHICH COLUMN IS THE REVENUE. sales_records carries both `revenue` and `total_revenue`, and on
-- production they disagree on 2 of 19 rows by Rs 53,500 in total:
--
--   id=2  4000 kg @ Rs 78 = 3,12,000 (total_revenue)   60 bags @ Rs 6,500 = 3,90,000 (revenue)
--   id=3  2750 kg @ Rs 70 = 1,92,500 (total_revenue)   30 bags @ Rs 5,600 = 1,68,000 (revenue)
--
-- So `revenue` is bags x price-per-bag and `total_revenue` is kilos x price-per-kg, and these
-- two sales were entered with a bag price and a kilo price that do not agree. Which is correct
-- depends on how each sale was actually contracted, and that is the estate's answer to give, not
-- this migration's. What is chosen here is only *consistency*: `revenue` first, because it is
-- what finance-balance-sheet and exports/ops -- the two routes that already share a definition
-- via lib/server/pnl.ts -- have always used. season-pl read total_revenue and will therefore
-- move by Rs 53,500 toward the balance sheet rather than away from it.
--
-- NOTHING IS RESTATED. This adds a view. Every underlying row keeps its own columns, and the two
-- disagreeing sales stay exactly as entered so they can be corrected once the estate says which
-- price was real.

DROP VIEW IF EXISTS booked_revenue;

CREATE VIEW booked_revenue
WITH (security_invoker = true) AS

  -- Coffee, dispatched and sold through the main flow.
  SELECT
    s.tenant_id,
    s.id::text                                          AS source_id,
    'sale'::text                                        AS source,
    s.sale_date,
    s.location_id,
    COALESCE(NULLIF(s.revenue, 0), s.total_revenue, 0)  AS revenue,
    -- Best effort, in the order the routes themselves try: an explicit kilo figure, then the
    -- weight columns. Bags are deliberately not converted here -- bag weight is a per-tenant
    -- setting the database does not know, so a route that needs that fallback still applies it.
    COALESCE(NULLIF(s.kgs, 0), NULLIF(s.weight_kgs, 0), NULLIF(s.kgs_received, 0), NULLIF(s.kgs_sent, 0), 0) AS kgs,
    s.bags_sold,
    NULLIF(s.estate, '')                                AS estate,
    NULLIF(s.buyer_name, '')                            AS buyer_name,
    s.created_at
  FROM sales_records s

  UNION ALL

  -- Pepper and anything else sold outside the coffee flow. Priced per kilo or as a lump-sum
  -- contract, so the amount has to be resolved rather than read from one column.
  SELECT
    o.tenant_id,
    o.id::text                                          AS source_id,
    'other_sale'::text                                  AS source,
    o.sale_date,
    o.location_id,
    COALESCE(
      NULLIF(o.revenue, 0),
      NULLIF(o.contract_amount, 0),
      COALESCE(o.kgs_sold, 0) * COALESCE(o.rate_per_kg, 0)
    )                                                   AS revenue,
    COALESCE(o.kgs_sold, 0)                             AS kgs,
    NULL::numeric                                       AS bags_sold,
    -- other_sales_records has no denormalised estate column; it is located by location_id only,
    -- so callers resolving an estate name join locations rather than reading this.
    NULL::text                                          AS estate,
    NULLIF(o.buyer_name, '')                            AS buyer_name,
    o.created_at
  FROM other_sales_records o;

COMMENT ON VIEW booked_revenue IS
  'Every sale the estate has booked, coffee and otherwise, with one revenue definition. Read this rather than sales_records -- reading the table directly is how pepper revenue went missing from six routes. security_invoker=true so RLS on the underlying tables still applies to app_runtime.';

-- Same proof 117 does for labour_cost: a view that silently bypasses RLS is a cross-tenant leak
-- and is invisible from the application side.
DO $$
DECLARE
  invoker BOOLEAN;
BEGIN
  SELECT COALESCE((
    SELECT option_value::boolean
    FROM pg_options_to_table((SELECT reloptions FROM pg_class WHERE relname = 'booked_revenue'))
    WHERE option_name = 'security_invoker'
  ), FALSE) INTO invoker;

  IF NOT invoker THEN
    RAISE EXCEPTION 'booked_revenue must be security_invoker; without it app_runtime reads every tenant';
  END IF;
END $$;
