-- 147: One rainfall figure per day, defined once.
--
-- Migration 146 let a second estate record the same day. Every consumer written before it assumed
-- one row per day per tenant and simply added whatever rows it was handed -- so the moment Medappa
-- record both gauges, all of them report twice the rain that fell. Two inches at Tirtha and two at
-- Citrus is two inches on the property, not four: rainfall is a DEPTH, not a quantity.
--
-- The tab was fixed in the client. This exists because it was not the only one. A sweep of every
-- reader found five more, three of which post the number to a customer by email:
--
--   lib/server/agents/digest-shared.ts      last 7 / last 30 totals, feeding BOTH digests
--   lib/server/agents/weekly-digest-agent   the week's rainfall line
--   lib/server/agents/daily-digest-agent    the day's rainfall line
--   app/api/intelligence-brief/route.ts     last 7 days, into the AI brief
--   app/api/yield-forecast/route.ts         season rainfall, into the forecast
--
-- Patching five queries in five files is how the sixth one gets missed and how the five drift
-- apart afterwards. One view, one definition, the same approach booked_revenue takes for revenue.
--
-- AVERAGE, NOT SUM. When two gauges disagree, the average is what a property-level figure can
-- honestly mean; the sum is simply wrong. With one gauge -- every tenant but Medappa and HoneyFarm
-- today -- AVG over a single row is that row, so nothing changes for anybody else.
--
-- NOT FILTERED BY ESTATE. Callers that care scope it themselves, exactly as they do rainfall_records
-- (a NULL estate is the whole property and belongs to every estate's view of the day). gauge_count
-- is exposed so a screen can say when it is showing an average rather than a measurement.
--
-- security_invoker so RLS applies as the calling role, matching booked_revenue. Without it the view
-- would run as its owner and quietly hand every tenant's rain to whoever asked.

CREATE OR REPLACE VIEW rainfall_daily
WITH (security_invoker = true) AS
  SELECT
    tenant_id,
    record_date,
    AVG(inches + cents::numeric / 100)  AS rainfall_inches,
    COUNT(*)::int                       AS gauge_count,
    MIN(estate)                         AS sample_estate
  FROM rainfall_records
  GROUP BY tenant_id, record_date;

DO $$
DECLARE
  invoker TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'rainfall_daily') THEN
    RAISE EXCEPTION '147: rainfall_daily was not created';
  END IF;

  -- A view without security_invoker is an RLS bypass wearing a helpful name.
  SELECT COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                    WHERE option_name = 'security_invoker'), 'false')
    INTO invoker
  FROM pg_class c WHERE c.relname = 'rainfall_daily';
  IF invoker IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION '147: rainfall_daily must be security_invoker (got %)', invoker;
  END IF;
END $$;
