-- Optional: keep Curing + Quality modules disabled for an existing tenant.
-- Only run if you DO NOT want these modules available for a specific tenant.

-- 1) Find the tenant id (pick the current main estate tenant):
-- SELECT id, name FROM tenants ORDER BY created_at;

-- 2) Disable the modules at the tenant level (replace <TENANT_ID>):
INSERT INTO tenant_modules (tenant_id, module, enabled)
VALUES
  (<TENANT_ID>, 'curing', false),
  (<TENANT_ID>, 'quality', false)
ON CONFLICT (tenant_id, module)
DO UPDATE SET enabled = EXCLUDED.enabled;

-- 3) Remove any user-level overrides (replace <TENANT_ID>):
UPDATE user_modules
SET enabled = false
WHERE tenant_id = <TENANT_ID>
  AND module IN ('curing', 'quality');
