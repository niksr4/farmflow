-- Tenant settings (bag weight per estate).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS bag_weight_kg NUMERIC NOT NULL DEFAULT 50;
