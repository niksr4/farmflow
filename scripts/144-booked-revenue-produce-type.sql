-- 144: booked_revenue says WHAT was sold, not just what it was worth.
--
-- WHY. 121 gave revenue one definition and pointed eleven routes at the view. Three of them were
-- not only summing money -- they were breaking the sale down by coffee type and bag type, and the
-- view exposes neither. Those three have been returning a 500 to every tenant on every load ever
-- since:
--
--   app/api/season-summary/route.ts    coffee_type, bag_type, lot_id  (the "This season" tab)
--   app/api/exception-alerts/route.ts  coffee_type, bag_type
--   app/api/intelligence-brief/route.ts coffee_type, bag_type
--
-- `column "coffee_type" does not exist` is a runtime failure no typecheck and no lint can see, and
-- it is the same shape as the kgs_received/weight_kgs/kgs_sent break that scripts/dev/api-smoke.mjs
-- was written for -- a query pointed at the view without its SELECT list being brought along.
--
-- WHAT IT IS CALLED. `produce_type`, not `coffee_type`. Coffee has two types, arabica and robusta,
-- and that is all sales_records ever holds. The other arm is pepper, arecanut, or whatever else the
-- planter grows, and calling that column "coffee type" is how pepper ends up counted as coffee in
-- the next report somebody writes. Callers that genuinely mean coffee filter on source = 'sale',
-- which is the honest way to ask.
--
-- bag_type and lot_id are coffee-only by nature: a bag of pepper is not dry parchment or dry
-- cherry, and other_sales_records has no lot column. Both are NULL on that arm, so
-- `WHERE lot_id IS NOT NULL` keeps behaving as the lot views expect.
--
-- Nothing else about the view changes. Same revenue precedence, same kilo resolution, same
-- security_invoker.

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
    s.created_at,
    NULLIF(s.coffee_type::text, '')                     AS produce_type,
    NULLIF(s.bag_type::text, '')                        AS bag_type,
    NULLIF(s.lot_id, '')                                AS lot_id
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
    o.created_at,
    NULLIF(o.asset_type, '')                            AS produce_type,
    NULL::text                                          AS bag_type,
    NULL::text                                          AS lot_id
  FROM other_sales_records o;

COMMENT ON VIEW booked_revenue IS
  'Every sale the estate has booked, coffee and otherwise, with one revenue definition. Read this rather than sales_records -- reading the table directly is how pepper revenue went missing from six routes. produce_type is arabica/robusta on source=''sale'' and pepper/arecanut/etc on source=''other_sale''; bag_type and lot_id are coffee-only and NULL on the other arm. security_invoker=true so RLS on the underlying tables still applies to app_runtime.';

-- Same proof 117 and 121 do: a view that silently bypasses RLS is a cross-tenant leak and is
-- invisible from the application side.
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

-- And a proof of the actual regression: the three columns this migration exists to add.
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(c, ', ')
    INTO missing
    FROM unnest(ARRAY['produce_type', 'bag_type', 'lot_id']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'booked_revenue' AND column_name = c
   );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'booked_revenue is missing %', missing;
  END IF;
END $$;
