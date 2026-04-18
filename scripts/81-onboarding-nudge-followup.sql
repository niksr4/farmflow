-- Migration 81: second onboarding nudge tracking
-- Adds nudge_2_sent_at to signup_requests so we can send a follow-up
-- re-engagement email ~7 days after the first nudge if setup is still incomplete.

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS nudge_2_sent_at TIMESTAMP WITHOUT TIME ZONE;
