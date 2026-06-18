-- 96: tenant_dormancy_probes — tracks the re-engagement probe email sent to a
-- tenant admin once per dormancy episode (no login AND no operational data
-- entry for DORMANCY_THRESHOLD_DAYS). last_known_activity_at lets the agent
-- detect a *new* dormancy episode (tenant came back, then went quiet again)
-- vs. an already-probed ongoing dormancy.

CREATE TABLE IF NOT EXISTS tenant_dormancy_probes (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_probe_sent_at TIMESTAMPTZ NOT NULL,
  last_known_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
