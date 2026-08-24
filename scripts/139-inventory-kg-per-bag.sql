-- 139: how many kilos are in a bag of this, so bags can be typed and kilos stored.
--
-- Stock is weighed; it is never counted in bags, because "a bag" is 45 kg of urea, 50 of MOP or
-- DAP, and something else again for the next product. scripts/12x removed "bags" as a unit for
-- exactly that reason and the reasoning still holds.
--
-- What it left behind is a real gap: estates BUY in bags. The invoice says "20 bags", the shed has
-- twenty sacks in it, and the person entering stock has to do arithmetic in their head to record
-- 900 kg -- which is the same arithmetic-in-the-head that made us ask for invoice totals instead of
-- per-unit rates a few hours ago.
--
-- So bags become an input convenience, not a unit. The quantity stored is still kilos, always. This
-- column only remembers the sack size for an item so nobody types it twice.
--
-- WHY NOT REUSE tenant_settings.bag_weight_kg. That is the coffee trade bag -- a nominal weight
-- used by processing, dispatch and sales, where a bag really is a unit of trade with an agreed
-- weight. It is one number for the whole tenant, and fertiliser needs one per item. Overloading it
-- would make a parchment bag and a urea sack the same object, which is the confusion this whole
-- line of work has been undoing.
--
-- NULLABLE ON PURPOSE. Most items are never bought in bags -- liquids, and anything sold loose.
-- A default of 50 would be a guess wearing a measurement's clothes, and the estates most likely to
-- accept it are the ones least able to notice it was wrong.

ALTER TABLE current_inventory
  ADD COLUMN IF NOT EXISTS kg_per_bag NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'current_inventory_kg_per_bag_positive'
  ) THEN
    ALTER TABLE current_inventory
      ADD CONSTRAINT current_inventory_kg_per_bag_positive
      CHECK (kg_per_bag IS NULL OR kg_per_bag > 0);
  END IF;
END $$;

DO $$
DECLARE
  missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM information_schema.columns
  WHERE table_name = 'current_inventory' AND column_name = 'kg_per_bag';

  IF missing <> 1 THEN
    RAISE EXCEPTION '139: current_inventory.kg_per_bag was not added';
  END IF;
END $$;
