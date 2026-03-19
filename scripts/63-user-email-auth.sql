-- Email-based identity support for self-serve onboarding.
-- Safe to run multiple times.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS normalized_email TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'en';

UPDATE users
SET normalized_email = LOWER(BTRIM(email))
WHERE email IS NOT NULL
  AND BTRIM(email) <> ''
  AND (normalized_email IS NULL OR BTRIM(normalized_email) = '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_normalized_email_unique
  ON users (normalized_email)
  WHERE normalized_email IS NOT NULL;

