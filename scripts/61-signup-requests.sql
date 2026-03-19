-- Self-serve signup requests for email-verification onboarding.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS signup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  estate_name TEXT NOT NULL,
  country TEXT,
  preferred_locale TEXT NOT NULL DEFAULT 'en',
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT,
  tenant_id UUID,
  user_id UUID,
  generated_username TEXT,
  verification_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP,
  provisioned_at TIMESTAMP,
  provisioning_error TEXT,
  last_ip_address TEXT,
  last_user_agent TEXT
);

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS generated_username TEXT;
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMP;
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMP;
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS provisioning_error TEXT;
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS last_ip_address TEXT;
ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS last_user_agent TEXT;

ALTER TABLE signup_requests DROP CONSTRAINT IF EXISTS signup_requests_status_check;
ALTER TABLE signup_requests
  ADD CONSTRAINT signup_requests_status_check
  CHECK (status IN ('pending', 'verified', 'provisioned', 'expired', 'cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_requests_normalized_email_active_unique
  ON signup_requests (normalized_email)
  WHERE status IN ('pending', 'verified', 'provisioned');

CREATE INDEX IF NOT EXISTS idx_signup_requests_status_created_at
  ON signup_requests (status, created_at DESC);

