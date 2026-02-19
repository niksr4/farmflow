-- Password rotation support for temporary reset flow.
-- Safe to run multiple times.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP;

