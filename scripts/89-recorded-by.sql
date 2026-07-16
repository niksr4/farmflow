-- Migration 89: store who recorded labour and expense entries
-- The GET endpoints previously hardcoded user: "system" because neither
-- table had a column for it. Old rows stay NULL and render as "—".

ALTER TABLE labor_transactions ADD COLUMN IF NOT EXISTS recorded_by TEXT;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS recorded_by TEXT;
