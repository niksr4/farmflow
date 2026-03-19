-- Verification tokens for self-serve signup requests.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS signup_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signup_request_id UUID NOT NULL REFERENCES signup_requests(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'verify_email',
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE signup_tokens
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'verify_email';
ALTER TABLE signup_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE signup_tokens
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMP;

ALTER TABLE signup_tokens DROP CONSTRAINT IF EXISTS signup_tokens_purpose_check;
ALTER TABLE signup_tokens
  ADD CONSTRAINT signup_tokens_purpose_check
  CHECK (purpose IN ('verify_email'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_tokens_token_hash_unique
  ON signup_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_signup_tokens_signup_request_active
  ON signup_tokens (signup_request_id, created_at DESC)
  WHERE consumed_at IS NULL;

