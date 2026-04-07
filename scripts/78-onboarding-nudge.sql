-- Migration 78: onboarding nudge tracking
-- Adds nudge_sent_at to signup_requests so we can send exactly one re-engagement
-- email to self-serve tenants who signed up but never completed guided setup.

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS nudge_sent_at TIMESTAMP WITHOUT TIME ZONE;
