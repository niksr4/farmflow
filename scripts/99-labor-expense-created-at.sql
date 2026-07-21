-- 99: Add created_at to labor_transactions and expense_transactions.
--
-- Both tables shipped without a created_at column, but the rapid double-submit dedup
-- guards in app/api/labor-neon/route.ts and app/api/expenses-neon/route.ts filter on
-- created_at >= NOW() - INTERVAL '90 seconds'. The 42703 (undefined column) error was
-- caught by isMissingColumnError() and silently swallowed on every save — so double-submit
-- protection has never actually run in production. Adding the column brings the existing
-- guards to life with no code change.
--
-- Existing rows are backfilled from their business date (noon IST) rather than left at the
-- migration-time default, so no historical row can look "recent" to the 90-second window
-- right after this migration runs.
--
-- Idempotent: safe to run repeatedly on both dev and prod.

ALTER TABLE labor_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE labor_transactions
SET created_at = (deployment_date::date + TIME '12:00') AT TIME ZONE 'Asia/Kolkata'
WHERE created_at IS NULL;

UPDATE expense_transactions
SET created_at = (entry_date::date + TIME '12:00') AT TIME ZONE 'Asia/Kolkata'
WHERE created_at IS NULL;

ALTER TABLE labor_transactions
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE expense_transactions
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;
