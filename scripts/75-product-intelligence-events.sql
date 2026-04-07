-- First-party tenant usage and recommendation feedback storage.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenant_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_username TEXT,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  module_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_events_tenant_occurred
  ON tenant_usage_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_events_type_occurred
  ON tenant_usage_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_events_module_occurred
  ON tenant_usage_events (module_id, occurred_at DESC)
  WHERE module_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tenant_recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recommendation_key TEXT NOT NULL,
  verdict TEXT NOT NULL
    CHECK (verdict IN ('accepted', 'dismissed', 'snoozed')),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_recommendation_feedback_tenant_created
  ON tenant_recommendation_feedback (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_recommendation_feedback_key_created
  ON tenant_recommendation_feedback (recommendation_key, created_at DESC);
