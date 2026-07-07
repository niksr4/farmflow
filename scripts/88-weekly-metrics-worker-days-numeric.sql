-- Migration 88: widen labor_worker_days from INT to NUMERIC(10,2)
-- SUM(hf_laborers + outside_laborers) can return fractional values when
-- those columns are NUMERIC, causing "invalid input syntax for type integer"
-- on the weekly cron. INT → NUMERIC is a safe widening with no data loss.

ALTER TABLE tenant_weekly_metrics
  ALTER COLUMN labor_worker_days TYPE NUMERIC(10,2);
