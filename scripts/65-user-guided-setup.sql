-- Track completion of the first-run guided workspace setup.
-- Safe to run multiple times.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMP;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS requires_guided_setup BOOLEAN NOT NULL DEFAULT FALSE;
