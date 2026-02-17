-- Tenant UI preferences (dashboard display flags).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{}'::jsonb;
