-- Optional hardening: keep processing "to date" fields in sync even if data is edited outside the app.
-- Creates a function + trigger to recompute to-date totals after inserts/updates/deletes.

CREATE OR REPLACE FUNCTION recompute_processing_totals(
  p_tenant_id uuid,
  p_location_id uuid,
  p_coffee_type text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  bag_weight numeric := 50;
BEGIN
  SELECT COALESCE(bag_weight_kg, 50)
    INTO bag_weight
  FROM tenants
  WHERE id = p_tenant_id
  LIMIT 1;

  IF bag_weight IS NULL OR bag_weight <= 0 THEN
    bag_weight := 50;
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
      CASE WHEN (COALESCE(green_today, 0) + COALESCE(float_today, 0)) > 0
        THEN ROUND((COALESCE(dry_cherry, 0) / (COALESCE(green_today, 0) + COALESCE(float_today, 0))) * 100, 2)
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
$$;

CREATE OR REPLACE FUNCTION processing_records_recompute_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_id uuid;
  location_id uuid;
  coffee_type text;
BEGIN
  tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);
  location_id := COALESCE(NEW.location_id, OLD.location_id);
  coffee_type := COALESCE(NEW.coffee_type, OLD.coffee_type);

  IF tenant_id IS NOT NULL AND location_id IS NOT NULL AND coffee_type IS NOT NULL THEN
    PERFORM recompute_processing_totals(tenant_id, location_id, coffee_type);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_processing_records_recompute ON processing_records;
CREATE TRIGGER trg_processing_records_recompute
AFTER INSERT OR UPDATE OR DELETE ON processing_records
FOR EACH ROW
EXECUTE FUNCTION processing_records_recompute_trigger();
