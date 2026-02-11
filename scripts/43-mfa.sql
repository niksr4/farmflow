-- MFA fields for admin security
-- Safe to run multiple times.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_recovery_codes TEXT[];
