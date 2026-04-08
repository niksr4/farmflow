-- Migration 80: API response cache
-- Lightweight key/value store for upstream API responses.
-- Used to avoid burning rate-limited external API quotas on every request.
-- Entries are replaced on each refresh; old entries cleaned up by the cron.

CREATE TABLE IF NOT EXISTS api_response_cache (
  cache_key     TEXT        PRIMARY KEY,
  response_json JSONB       NOT NULL,
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_response_cache_cached_at
  ON api_response_cache (cached_at);
