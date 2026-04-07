-- Migration 79: per-tenant weekly metrics for AI learning
-- Stores computed operational metrics per tenant per ISO week.
-- The weekly digest agent writes these after each run and reads the last
-- N weeks to build estate-specific baselines for Claude's prompts.

CREATE TABLE IF NOT EXISTS tenant_weekly_metrics (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  week_start          DATE          NOT NULL,  -- ISO Monday of the week

  -- Processing
  cherry_kg           NUMERIC(12,2) NOT NULL DEFAULT 0,
  processing_days     INT           NOT NULL DEFAULT 0,
  parchment_bags      NUMERIC(10,2) NOT NULL DEFAULT 0,  -- dry parchment bags dispatched that week

  -- Labor
  labor_entries       INT           NOT NULL DEFAULT 0,
  labor_worker_days   INT           NOT NULL DEFAULT 0,
  labor_cost          NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Expenses
  expense_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  expense_entries     INT           NOT NULL DEFAULT 0,

  -- Other
  rainfall_inches     NUMERIC(8,3)  NOT NULL DEFAULT 0,
  dispatch_bags       NUMERIC(10,2) NOT NULL DEFAULT 0,
  sales_revenue       NUMERIC(16,2) NOT NULL DEFAULT 0,
  picking_entries     INT           NOT NULL DEFAULT 0,

  computed_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT tenant_weekly_metrics_tenant_week_uq UNIQUE (tenant_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_tenant_weekly_metrics_tenant_week
  ON tenant_weekly_metrics (tenant_id, week_start DESC);
