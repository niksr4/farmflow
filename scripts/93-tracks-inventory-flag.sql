-- Migration 93: tracks_inventory flag on activity codes
--
-- When an expense uses a code tagged tracks_inventory=true, the app
-- auto-expands the inventory link section and shows a prompt so users
-- don't forget to update stock when buying fertiliser, lime, chemicals, or fuel.
--
-- Codes NOT tagged (electricity, vehicle, salaries, tax, maintenance)
-- keep the inventory section collapsed/optional — no friction for them.

ALTER TABLE account_activities
  ADD COLUMN IF NOT EXISTS tracks_inventory BOOLEAN NOT NULL DEFAULT FALSE;

-- Tag codes that represent physical materials kept in estate stock
UPDATE account_activities
SET tracks_inventory = TRUE
WHERE code IN (
  '114',  -- Fuel / HSD
  '123',  -- Tools And Implements
  '133',  -- Arabica Borer Tracing          (tracing chemicals)
  '135',  -- Arabica, Cost Lime, Manure
  '136',  -- Arabica Lime, Manuring
  '137',  -- Arabica Spraying               (spray chemicals)
  '139',  -- Arabica Supplies, Upkeep
  '155',  -- Robusta, Cost Lime, Manure
  '156',  -- Robusta Liming, Manuring
  '157',  -- Robusta Spray
  '159',  -- Supplies Planting, Upkeep
  '163',  -- Robusta Irrigation             (HSD for irrigation pump)
  '245'   -- Organic Compost Manure
);
