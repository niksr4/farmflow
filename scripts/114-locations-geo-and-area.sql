-- 114: Give each block a position on the earth and a size.
--
-- Two unrelated things want this, which is why it is worth doing before either.
--
-- CERTIFICATION. INDICOFS (Coffee Board, Dec 2025) asks for it in five separate grower clauses,
-- all of them Level 1 -- the basic tier a Coffee Board inspector checks against a checklist:
--   4.2A  farms up to 4 ha: a sketch carrying one geo-coordinate
--   4.2B  farms over 4 ha: a map with borders, coordinates in all directions and the coffee
--         blocks identified -- "Farm map or Polygon if exporting to EU"
--   4.3A  farm land characteristics, recorded against the farm map
--   4.5.1A no conversion through deforestation after 31 December 2020, evidenced by ownership
--         records plus the farm map
--   4.5.1C no cultivation in buffer or high-conservation zones, evidenced by the farm map
-- A single point per block satisfies 4.2A outright and is the minimum viable answer to the
-- others. A polygon is what EU export will eventually need; a point is not a polygon, and this
-- migration deliberately does not pretend otherwise -- see the note at the bottom.
--
-- ECONOMICS. Cost per block is only comparable between blocks once you can divide by area.
-- Per acre is the number growers actually argue about; per-plant is per-acre times a density
-- estimate, because nobody counts plants.
--
-- Stored in ACRES, not hectares, because that is the unit Coorg estates speak and type. The
-- standard's own thresholds are in hectares -- convert at 1 ha = 2.47105 acres when testing
-- the 4 ha and 10 ha rules rather than storing a second column that can disagree with the first.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS latitude   NUMERIC(9,6);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS longitude  NUMERIC(9,6);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS area_acres NUMERIC(10,3);

DO $$
BEGIN
  -- Range checks rather than trust: a transposed lat/long is the classic silent error here, and
  -- Indian coffee sits around 12N 75E, so a swapped pair still lands inside both ranges and
  -- cannot be caught by bounds alone. These only stop the grossly wrong.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_latitude_check') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_latitude_check
      CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_longitude_check') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_longitude_check
      CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_area_acres_check') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_area_acres_check
      CHECK (area_acres IS NULL OR area_acres > 0);
  END IF;

  -- A lone coordinate is meaningless, so the pair travels together or not at all.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_coords_paired_check') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_coords_paired_check
      CHECK ((latitude IS NULL) = (longitude IS NULL));
  END IF;
END $$;

-- All three are nullable and every existing row keeps working untouched. Nothing in the app
-- requires them yet; they are filled in from the Locations settings page as estates get to it.
--
-- NOT DONE HERE, on purpose: polygon geometry for EU Deforestation Regulation. That needs
-- PostGIS or a jsonb ring of coordinates plus a way to capture it (drawing a boundary on a map
-- is a different feature from typing a lat/long), and no current tenant exports to the EU.
-- INDICOFS puts deforestation-free traceability at Level 3 -- 4.4.1F -- and all six tenants are
-- Level 1 candidates. Revisit when an estate actually has an EU buyer.
