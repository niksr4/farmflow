-- 108: Self-serve email change.
--
-- Until now users.email was write-once: set at signup, never updated by any code path in the
-- app. Changing an address meant a manual UPDATE against production. That is a support ticket
-- per request and, worse, a hand-written UPDATE can easily set `email` without `normalized_email`
-- (breaking password reset, which looks the account up by the normalized column) or leave
-- `email_verified_at` pointing at a verification that happened for a DIFFERENT address.
--
-- The flow this table backs:
--   1. authenticated user posts the new address AND their current password
--   2. a single-use token is mailed to the NEW address (proving they control it)
--   3. the OLD address is notified, so a session hijack trying to take the account over is
--      visible to the real owner rather than silent
--   4. consuming the token swaps email + normalized_email + email_verified_at together
--
-- Deliberately mirrors scripts/101-password-reset-tokens.sql: same column shapes, same unique
-- hash index, same consumed_at/expires_at state machine. Two token tables that behave alike are
-- much easier to reason about than two that each invented their own rules.
--
-- No tenant_id column, and therefore no RLS policy — identical to password_reset_tokens. These
-- rows are keyed by user_id and are only ever read by a token hash that is mailed to one
-- address; scoping them per tenant would add nothing, and script 98's sweep only covers tables
-- that carry tenant_id.

CREATE TABLE IF NOT EXISTS email_change_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Stored as entered (for display in the confirmation email) and normalized (for the
  -- uniqueness pre-check). The authoritative uniqueness guarantee is still
  -- idx_users_normalized_email_unique on users; this column only lets us fail early and
  -- politely instead of surfacing a raw constraint violation.
  new_email TEXT NOT NULL,
  normalized_new_email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  requested_ip TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_change_tokens_token_hash_unique
  ON email_change_tokens (token_hash);

-- Supports "invalidate this user's other outstanding requests" when a new one is issued, so a
-- previously-mailed link cannot still be redeemed after the user changes their mind.
CREATE INDEX IF NOT EXISTS idx_email_change_tokens_user_pending
  ON email_change_tokens (user_id)
  WHERE consumed_at IS NULL;
