-- Persist tenant subscription plan for entitlement enforcement.
-- Safe to run multiple times.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT;

UPDATE tenants
SET subscription_plan = 'core'
WHERE subscription_plan IS NULL;

ALTER TABLE tenants
  ALTER COLUMN subscription_plan SET DEFAULT 'core';

ALTER TABLE tenants
  ALTER COLUMN subscription_plan SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_subscription_plan_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_subscription_plan_check
      CHECK (subscription_plan IN ('basic', 'core', 'enterprise'));
  END IF;
END
$$;
