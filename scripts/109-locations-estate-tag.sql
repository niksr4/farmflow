-- Optional grouping tag for tenants that run multiple estates under one account
-- (e.g. Medappa Estates: Tirtha + Citrus Grove). NULL for every tenant that doesn't
-- use it -- purely additive, no behavior change for single-estate tenants.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS estate TEXT;
