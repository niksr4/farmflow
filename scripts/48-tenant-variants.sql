-- Tenant experience profile controls
-- Enables per-tenant UI variants and feature flags without code forking.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ui_variant TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_ui_variant_check'
      AND conrelid = 'tenants'::regclass
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_ui_variant_check
      CHECK (ui_variant IN ('standard', 'legacy-estate', 'ops-focused'));
  END IF;
END
$$;
