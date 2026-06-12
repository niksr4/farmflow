-- Migration 94: weekly digest feedback
-- Stores a thumbs up/down rating per tenant per digest week, recorded via
-- signed click-through links in the digest email (no login required).

CREATE TABLE IF NOT EXISTS digest_feedback (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  week_start  DATE        NOT NULL,  -- ISO Monday of the digested week
  token_hash  TEXT        NOT NULL,
  rating      TEXT        CHECK (rating IN ('up', 'down')),
  rated_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT digest_feedback_tenant_week_uq UNIQUE (tenant_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_digest_feedback_token_hash
  ON digest_feedback (token_hash);
