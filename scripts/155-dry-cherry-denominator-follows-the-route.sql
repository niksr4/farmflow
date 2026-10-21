-- 155: the dry cherry ratio stops assuming one estate's convention
--
-- ⚠ READ THIS BEFORE THE SQL. This migration exists because the APP-SIDE FIX IN #66 CANNOT WORK
-- WITHOUT IT. `trg_processing_records_recompute` is enabled on `processing_records` and fires
-- AFTER INSERT OR UPDATE OR DELETE, so the database -- not the component, and not the route
-- handler -- owns the stored value of `dry_cherry_percent`. Merging the TypeScript fix alone would
-- show the corrected ratio on screen until the row was saved, at which point the trigger would
-- recompute it the old way. Silently, like everything else in this codebase.
--
-- THE BUG. The denominator was, literally:
--
--     dry_cherry_percent = dry_cherry / (green_today + float_today)
--
-- That is not a definition. It is one estate's operating convention written as arithmetic: it says
-- cherry is made from the low-grade fraction, which is exactly what HoneyFarm does -- they wash the
-- ripe and dry the green and the floats whole. Their figures are correct and always have been.
--
-- It is wrong for an estate that dry-processes its ripe crop, which is an ordinary way to run a
-- Robusta property and the only way to run one with no water:
--
--   * record the sort split, and the denominator is small -- the ratio reads 300 to 500%;
--   * skip it, and the denominator is ZERO -- the ratio reads 0%, so the season's only yield
--     figure is silently absent on a screen that looks complete.
--
-- Neither throws. The second is worse, because an absurd number gets queried and a plausible zero
-- does not.
--
-- THE RULE, which mirrors lib/processing-ratios.ts exactly. The honest question is "how much fresh
-- fruit went to the drying yard whole?", and that follows from the estate's route by mass balance:
--
--     pulped input  = 0 if the route is natural, else the day's ripe
--     cherry input  = 0 if the route is wet, else max(0, crop - pulped input)
--
-- Clamped at zero deliberately: a writer who types a ripe weight above the day's crop would
-- otherwise get a negative denominator and a negative ratio, which is a data-entry mistake wearing
-- a number's clothes. Zero makes the ratio absent rather than wrong.
--
-- ⚠ NO REAL TENANT'S STORED FIGURE MOVES, and that was measured rather than assumed. For a
-- `both`-route estate `crop - ripe` IS `green + float`, so the two formulas agree exactly wherever
-- mass balance holds. Checked against PRODUCTION on 2026-10-21:
--
--     HoneyFarm      76 processing rows, 0 where crop <> ripe+green+float (within 0.5 kg)
--     Estate Mock     4 processing rows, 4 mismatched -- the demo tenant, numbers typed rather
--                     than measured. Its ratios move. It is not a customer.
--     every other tenant: no processing rows at all
--
-- and all six tenants have `ui_preferences -> 'n' ->> 'processingRoute'` NULL, which resolves to
-- `both`. So on the day this is applied, the only estate with data is on the only route where the
-- old and new expressions are identical.
--
-- ⚠ CREATE OR REPLACE ON A LIVE WRITE PATH. Per the warning in CLAUDE.md, the dependents were
-- checked first: in `public`, exactly two functions mention this name -- the function itself and
-- `processing_records_recompute_trigger`, which calls it. Two triggers sit on the table
-- (`update_processing_records_updated_at`, `trg_processing_records_recompute`) and neither is
-- touched here. The signature, the return type and the other fourteen computed columns are
-- byte-identical to the live definition read back from production; the ONLY change is the
-- `dry_cherry_percent` expression and the route lookup it needs.
--
-- AFTER APPLYING: no backfill runs automatically, because this function only recomputes rows for a
-- (tenant, location, coffee_type) that is written. Existing rows keep their stored ratio until
-- something touches them. That is deliberate -- a silent mass rewrite of a figure estates
-- negotiate with their curer over is not something a migration should do unannounced. To refresh a
-- tenant on purpose, call recompute_processing_totals() for each of its groups.

CREATE OR REPLACE FUNCTION public.recompute_processing_totals(p_tenant_id uuid, p_location_id uuid, p_coffee_type text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  bag_weight numeric := 50;
  v_route text := 'both';
BEGIN
  SELECT COALESCE(bag_weight_kg, 50)
    INTO bag_weight
  FROM tenants
  WHERE id = p_tenant_id
  LIMIT 1;

  IF bag_weight IS NULL OR bag_weight <= 0 THEN
    bag_weight := 50;
  END IF;

  -- The estate's processing route, stored by the settings screen under the `n` key of the tenant's
  -- ui_preferences. Lenient on the way in, exactly like resolveProcessingRoute() in lib/crop-config:
  -- NULL means nobody has been asked yet, and an unrecognised value is somebody else's bug. Both
  -- resolve to `both`, the route that hides nothing.
  SELECT lower(trim(COALESCE(ui_preferences -> 'n' ->> 'processingRoute', '')))
    INTO v_route
  FROM tenants
  WHERE id = p_tenant_id
  LIMIT 1;

  IF v_route IS NULL OR v_route NOT IN ('wet', 'natural', 'both') THEN
    v_route := 'both';
  END IF;

  WITH ordered AS (
    SELECT
      id,
      COALESCE(crop_today, 0) AS crop_today,
      COALESCE(ripe_today, 0) AS ripe_today,
      COALESCE(green_today, 0) AS green_today,
      COALESCE(float_today, 0) AS float_today,
      COALESCE(wet_parchment, 0) AS wet_parchment,
      COALESCE(dry_parch, 0) AS dry_parch,
      COALESCE(dry_cherry, 0) AS dry_cherry,
      COALESCE(ROUND((COALESCE(dry_parch, 0) / NULLIF(bag_weight, 0))::numeric, 2), 0) AS dry_p_bags,
      COALESCE(ROUND((COALESCE(dry_cherry, 0) / NULLIF(bag_weight, 0))::numeric, 2), 0) AS dry_cherry_bags,
      SUM(COALESCE(crop_today, 0)) OVER (
        PARTITION BY tenant_id, location_id, coffee_type
        ORDER BY process_date, id
      ) AS crop_todate,
      SUM(COALESCE(ripe_today, 0)) OVER (
        PARTITION BY tenant_id, location_id, coffee_type
        ORDER BY process_date, id
      ) AS ripe_todate,
      SUM(COALESCE(green_today, 0)) OVER (
        PARTITION BY tenant_id, location_id, coffee_type
        ORDER BY process_date, id
      ) AS green_todate,
      SUM(COALESCE(float_today, 0)) OVER (
        PARTITION BY tenant_id, location_id, coffee_type
        ORDER BY process_date, id
      ) AS float_todate,
      SUM(COALESCE(dry_parch, 0)) OVER (
        PARTITION BY tenant_id, location_id, coffee_type
        ORDER BY process_date, id
      ) AS dry_p_todate,
      SUM(COALESCE(dry_cherry, 0)) OVER (
        PARTITION BY tenant_id, location_id, coffee_type
        ORDER BY process_date, id
      ) AS dry_cherry_todate,
      SUM(COALESCE(ROUND((COALESCE(dry_parch, 0) / NULLIF(bag_weight, 0))::numeric, 2), 0)) OVER (
        PARTITION BY tenant_id, location_id, coffee_type
        ORDER BY process_date, id
      ) AS dry_p_bags_todate,
      SUM(COALESCE(ROUND((COALESCE(dry_cherry, 0) / NULLIF(bag_weight, 0))::numeric, 2), 0)) OVER (
        PARTITION BY tenant_id, location_id, coffee_type
        ORDER BY process_date, id
      ) AS dry_cherry_bags_todate,
      CASE WHEN COALESCE(crop_today, 0) > 0
        THEN ROUND((COALESCE(ripe_today, 0) / COALESCE(crop_today, 0)) * 100, 2)
        ELSE 0
      END AS ripe_percent,
      CASE WHEN COALESCE(crop_today, 0) > 0
        THEN ROUND((COALESCE(green_today, 0) / COALESCE(crop_today, 0)) * 100, 2)
        ELSE 0
      END AS green_percent,
      CASE WHEN COALESCE(crop_today, 0) > 0
        THEN ROUND((COALESCE(float_today, 0) / COALESCE(crop_today, 0)) * 100, 2)
        ELSE 0
      END AS float_percent,
      CASE WHEN COALESCE(ripe_today, 0) > 0
        THEN ROUND((COALESCE(wet_parchment, 0) / COALESCE(ripe_today, 0)) * 100, 2)
        ELSE 0
      END AS fr_wp_percent,
      CASE WHEN COALESCE(wet_parchment, 0) > 0
        THEN ROUND((COALESCE(dry_parch, 0) / COALESCE(wet_parchment, 0)) * 100, 2)
        ELSE 0
      END AS wp_dp_percent,
      -- The one changed expression. Was: dry_cherry / (green_today + float_today).
      CASE
        WHEN v_route = 'wet' THEN 0
        WHEN GREATEST(
               COALESCE(crop_today, 0)
                 - CASE WHEN v_route = 'natural' THEN 0 ELSE COALESCE(ripe_today, 0) END,
               0
             ) > 0
        THEN ROUND(
               (COALESCE(dry_cherry, 0)
                 / GREATEST(
                     COALESCE(crop_today, 0)
                       - CASE WHEN v_route = 'natural' THEN 0 ELSE COALESCE(ripe_today, 0) END,
                     0
                   )
               ) * 100, 2)
        ELSE 0
      END AS dry_cherry_percent
    FROM processing_records
    WHERE tenant_id = p_tenant_id
      AND location_id = p_location_id
      AND coffee_type = p_coffee_type
  )
  UPDATE processing_records pr
  SET
    crop_todate = ordered.crop_todate,
    ripe_todate = ordered.ripe_todate,
    green_todate = ordered.green_todate,
    float_todate = ordered.float_todate,
    dry_p_todate = ordered.dry_p_todate,
    dry_cherry_todate = ordered.dry_cherry_todate,
    dry_p_bags = ordered.dry_p_bags,
    dry_cherry_bags = ordered.dry_cherry_bags,
    dry_p_bags_todate = ordered.dry_p_bags_todate,
    dry_cherry_bags_todate = ordered.dry_cherry_bags_todate,
    ripe_percent = ordered.ripe_percent,
    green_percent = ordered.green_percent,
    float_percent = ordered.float_percent,
    fr_wp_percent = ordered.fr_wp_percent,
    wp_dp_percent = ordered.wp_dp_percent,
    dry_cherry_percent = ordered.dry_cherry_percent
  FROM ordered
  WHERE pr.id = ordered.id;
END;
$function$;
