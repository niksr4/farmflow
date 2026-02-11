-- Security event logging for auth + permission changes.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_username TEXT,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  source TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant_created
  ON security_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type
  ON security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity
  ON security_events (severity, created_at DESC);
