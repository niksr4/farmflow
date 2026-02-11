-- DPDP privacy + data rights schema
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS privacy_notice_version TEXT,
  ADD COLUMN IF NOT EXISTS privacy_notice_accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS consent_marketing BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_marketing_updated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'correction', 'deletion')),
  request_details JSONB,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_tenant_id
  ON privacy_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_status
  ON privacy_requests (status);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_created_at
  ON privacy_requests (created_at DESC);
