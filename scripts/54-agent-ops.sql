-- Agent operations tables (additive only, safe for existing tenant data).
-- Purpose:
-- 1) Track agent runs/findings for auditability.
-- 2) Store normalized app error events for anomaly clustering.
-- 3) Persist nightly data integrity exceptions.
-- NOTE: This script creates structures only. It does not run any migration/data updates.

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  tenant_scope TEXT NOT NULL DEFAULT 'all',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT agent_runs_status_check CHECK (status IN ('running', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_started
  ON agent_runs (agent_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_started
  ON agent_runs (status, started_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tenant_id UUID,
  finding_type TEXT NOT NULL,
  finding_key TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_run_findings_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_agent_run_findings_run
  ON agent_run_findings (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_run_findings_type
  ON agent_run_findings (finding_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_run_findings_tenant
  ON agent_run_findings (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_error_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID,
  source TEXT NOT NULL,
  endpoint TEXT,
  error_code TEXT,
  severity TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  fingerprint TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_error_events_severity_check CHECK (severity IN ('warning', 'error', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_app_error_events_created
  ON app_error_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_events_source_created
  ON app_error_events (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_events_tenant_created
  ON app_error_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_events_fingerprint_created
  ON app_error_events (fingerprint, created_at DESC);

CREATE TABLE IF NOT EXISTS data_integrity_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  rule_code TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  last_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  CONSTRAINT data_integrity_exceptions_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT data_integrity_exceptions_status_check CHECK (status IN ('open', 'resolved'))
);

CREATE INDEX IF NOT EXISTS idx_data_integrity_exceptions_tenant_status
  ON data_integrity_exceptions (tenant_id, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_integrity_exceptions_rule
  ON data_integrity_exceptions (rule_code, status, last_seen_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_data_integrity_exceptions_open
  ON data_integrity_exceptions (tenant_id, rule_code, entity_key)
  WHERE status = 'open';
