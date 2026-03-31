-- Migration 73: Add optional task/field description to aggregate labor deployments.

ALTER TABLE labor_transactions
  ADD COLUMN IF NOT EXISTS task_description TEXT;
