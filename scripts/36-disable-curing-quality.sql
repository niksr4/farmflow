-- Optional: keep Curing + Quality modules disabled for an existing tenant.
-- Only run if you DO NOT want these modules available for a specific tenant.

-- 1) Find the tenant id (pick the current main estate tenant):
-- SELECT id, name FROM tenants ORDER BY created_at;

DO $$
DECLARE
  target_tenant_text TEXT := 'REPLACE_WITH_TENANT_ID';
  target_tenant UUID;
BEGIN
  IF target_tenant_text = 'REPLACE_WITH_TENANT_ID' THEN
    RAISE EXCEPTION 'Replace REPLACE_WITH_TENANT_ID with the tenant UUID before running.';
  END IF;

  target_tenant := target_tenant_text::uuid;

  -- 2) Disable the modules at the tenant level.
  INSERT INTO tenant_modules (tenant_id, module, enabled)
  VALUES
    (target_tenant, 'curing', false),
    (target_tenant, 'quality', false)
  ON CONFLICT (tenant_id, module)
  DO UPDATE SET enabled = EXCLUDED.enabled;

  -- 3) Remove any user-level overrides.
  UPDATE user_modules
  SET enabled = false
  WHERE tenant_id = target_tenant
    AND module IN ('curing', 'quality');
END $$;
