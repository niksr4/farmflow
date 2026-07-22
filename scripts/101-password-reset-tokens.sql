-- Self-serve "forgot password" tokens for locked-out users.
-- Mirrors the signup_tokens pattern (scripts/62-signup-tokens.sql): a random token is emailed
-- to the user, only its hash is stored, and it is single-use + time-limited.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  requested_ip TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash_unique
  ON password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_active
  ON password_reset_tokens (user_id, created_at DESC)
  WHERE consumed_at IS NULL;
