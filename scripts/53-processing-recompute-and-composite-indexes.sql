-- Recompute processing derived totals from daily values and add composite location indexes.
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_processing_records_tenant_location_date
  ON processing_records (tenant_id, location_id, process_date DESC);

CREATE INDEX IF NOT EXISTS idx_dispatch_records_tenant_location_date
  ON dispatch_records (tenant_id, location_id, dispatch_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_records_tenant_location_date
  ON sales_records (tenant_id, location_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_transaction_history_tenant_location_date
  ON transaction_history (tenant_id, location_id, transaction_date DESC);

DO $$
DECLARE
  recomputed_rows BIGINT := 0;
BEGIN
  ALTER TABLE processing_records DISABLE TRIGGER USER;

  WITH base AS (
    SELECT
      pr.id,
      pr.tenant_id,
      pr.location_id,
      pr.coffee_type,
      pr.process_date,
      COALESCE(pr.crop_today, 0) AS crop_today,
      COALESCE(pr.ripe_today, 0) AS ripe_today,
      COALESCE(pr.green_today, 0) AS green_today,
      COALESCE(pr.float_today, 0) AS float_today,
      COALESCE(pr.wet_parchment, 0) AS wet_parchment,
      COALESCE(pr.dry_parch, 0) AS dry_parch,
      COALESCE(pr.dry_cherry, 0) AS dry_cherry,
      COALESCE(NULLIF(t.bag_weight_kg, 0), 50) AS bag_weight_kg
    FROM processing_records pr
    LEFT JOIN tenants t
      ON t.id = pr.tenant_id
  ),
  ordered AS (
    SELECT
      b.id,
      SUM(b.crop_today) OVER (
        PARTITION BY b.tenant_id, b.location_id, b.coffee_type
        ORDER BY b.process_date, b.id
      ) AS crop_todate,
      SUM(b.ripe_today) OVER (
        PARTITION BY b.tenant_id, b.location_id, b.coffee_type
        ORDER BY b.process_date, b.id
      ) AS ripe_todate,
      SUM(b.green_today) OVER (
        PARTITION BY b.tenant_id, b.location_id, b.coffee_type
        ORDER BY b.process_date, b.id
      ) AS green_todate,
      SUM(b.float_today) OVER (
        PARTITION BY b.tenant_id, b.location_id, b.coffee_type
        ORDER BY b.process_date, b.id
      ) AS float_todate,
      SUM(b.dry_parch) OVER (
        PARTITION BY b.tenant_id, b.location_id, b.coffee_type
        ORDER BY b.process_date, b.id
      ) AS dry_p_todate,
      SUM(b.dry_cherry) OVER (
        PARTITION BY b.tenant_id, b.location_id, b.coffee_type
        ORDER BY b.process_date, b.id
      ) AS dry_cherry_todate,
      CASE
        WHEN b.bag_weight_kg > 0 THEN ROUND((b.dry_parch / b.bag_weight_kg)::numeric, 2)
        ELSE 0
      END AS dry_p_bags,
      CASE
        WHEN b.bag_weight_kg > 0 THEN ROUND((b.dry_cherry / b.bag_weight_kg)::numeric, 2)
        ELSE 0
      END AS dry_cherry_bags,
      SUM(
        CASE
          WHEN b.bag_weight_kg > 0 THEN ROUND((b.dry_parch / b.bag_weight_kg)::numeric, 2)
          ELSE 0
        END
      ) OVER (
        PARTITION BY b.tenant_id, b.location_id, b.coffee_type
        ORDER BY b.process_date, b.id
      ) AS dry_p_bags_todate,
      SUM(
        CASE
          WHEN b.bag_weight_kg > 0 THEN ROUND((b.dry_cherry / b.bag_weight_kg)::numeric, 2)
          ELSE 0
        END
      ) OVER (
        PARTITION BY b.tenant_id, b.location_id, b.coffee_type
        ORDER BY b.process_date, b.id
      ) AS dry_cherry_bags_todate,
      CASE
        WHEN b.crop_today > 0 THEN ROUND((b.ripe_today / b.crop_today) * 100, 2)
        ELSE 0
      END AS ripe_percent,
      CASE
        WHEN b.crop_today > 0 THEN ROUND((b.green_today / b.crop_today) * 100, 2)
        ELSE 0
      END AS green_percent,
      CASE
        WHEN b.crop_today > 0 THEN ROUND((b.float_today / b.crop_today) * 100, 2)
        ELSE 0
      END AS float_percent,
      CASE
        WHEN b.ripe_today > 0 THEN ROUND((b.wet_parchment / b.ripe_today) * 100, 2)
        ELSE 0
      END AS fr_wp_percent,
      CASE
        WHEN b.wet_parchment > 0 THEN ROUND((b.dry_parch / b.wet_parchment) * 100, 2)
        ELSE 0
      END AS wp_dp_percent,
      CASE
        WHEN (b.green_today + b.float_today) > 0 THEN ROUND((b.dry_cherry / (b.green_today + b.float_today)) * 100, 2)
        ELSE 0
      END AS dry_cherry_percent
    FROM base b
  ),
  updated AS (
    UPDATE processing_records pr
    SET
      crop_todate = o.crop_todate,
      ripe_todate = o.ripe_todate,
      green_todate = o.green_todate,
      float_todate = o.float_todate,
      dry_p_todate = o.dry_p_todate,
      dry_cherry_todate = o.dry_cherry_todate,
      dry_p_bags = o.dry_p_bags,
      dry_cherry_bags = o.dry_cherry_bags,
      dry_p_bags_todate = o.dry_p_bags_todate,
      dry_cherry_bags_todate = o.dry_cherry_bags_todate,
      ripe_percent = o.ripe_percent,
      green_percent = o.green_percent,
      float_percent = o.float_percent,
      fr_wp_percent = o.fr_wp_percent,
      wp_dp_percent = o.wp_dp_percent,
      dry_cherry_percent = o.dry_cherry_percent
    FROM ordered o
    WHERE pr.id = o.id
    RETURNING pr.id
  )
  SELECT COUNT(*) INTO recomputed_rows
  FROM updated;

  ALTER TABLE processing_records ENABLE TRIGGER USER;
  RAISE NOTICE 'recomputed_rows=%', recomputed_rows;
EXCEPTION
  WHEN OTHERS THEN
    ALTER TABLE processing_records ENABLE TRIGGER USER;
    RAISE;
END
$$;
