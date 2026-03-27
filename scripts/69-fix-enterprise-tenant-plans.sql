-- Fix enterprise tenant subscription plans that were incorrectly set to 'core'
-- by migration 66-tenant-subscription-plan.sql.
--
-- That migration ran UPDATE tenants SET subscription_plan = 'core' WHERE subscription_plan IS NULL,
-- which also downgraded enterprise tenants that hadn't had the column set explicitly.
--
-- Identify enterprise tenants by the presence of enterprise-only modules (curing, quality)
-- in their tenant_modules table.
--
-- Safe to run multiple times.

UPDATE tenants t
SET subscription_plan = 'enterprise'
WHERE t.subscription_plan = 'core'
  AND EXISTS (
    SELECT 1
    FROM tenant_modules tm
    WHERE tm.tenant_id = t.id
      AND tm.module IN ('curing', 'quality')
      AND tm.enabled = true
  );
