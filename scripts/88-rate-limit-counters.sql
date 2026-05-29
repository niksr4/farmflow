-- Distributed fixed-window rate limit counters backed by Neon.
-- Replaces the per-instance in-memory Map that was silently broken on serverless.
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key          TEXT    NOT NULL,
  window_start BIGINT  NOT NULL,  -- epoch ms: floor(now_ms / window_ms) * window_ms
  window_ms    INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_window_start
  ON rate_limit_counters (window_start);
