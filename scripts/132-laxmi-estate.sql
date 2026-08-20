-- 132: Laxmi's blocks belong to an estate called Laxmi.
--
-- Every one of Laxmi's five blocks carries estate = NULL, so the estate dimension is not misused
-- there -- it is entirely unused, exactly as HoneyFarm's was before 125. That was tolerable while
-- "blocks per estate" was optional. It is not, now that it is the standard for every tenant.
--
-- Laxmi is a single estate, confirmed 2026-08-20. One estate is not a pointless label: the estate
-- selector, the per-estate cost split and /api/dashboard/estate-attribution all key off it, and a
-- tenant with one estate should see one estate rather than a blank where the grouping should be.
-- It also means the day they buy a second property, the first one already has a name.
--
-- NOTHING MOVES. This sets a grouping label on five rows. Every record keeps the location_id it
-- has, no cost or total changes value, and filters that were unavailable start working.
--
-- Their storehouse is deliberately left at estate NULL -- lib/estate-filter.ts shows NULL-estate
-- rows under every estate, which is what a shared store should do.

DO $$
DECLARE
  t_id  uuid;
  n     integer;
BEGIN
  SELECT id INTO t_id FROM tenants WHERE name = 'Laxmi';
  IF t_id IS NULL THEN
    RAISE NOTICE '132: no Laxmi tenant here, skipping';
    RETURN;
  END IF;

  UPDATE locations SET estate = 'Laxmi'
   WHERE tenant_id = t_id AND kind = 'block' AND estate IS DISTINCT FROM 'Laxmi';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '132: % Laxmi block(s) grouped under estate Laxmi', n;

  SELECT COUNT(*) INTO n
    FROM locations WHERE tenant_id = t_id AND kind = 'block' AND estate IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '132: % Laxmi block(s) still have no estate', n;
  END IF;

  SELECT COUNT(*) INTO n
    FROM locations WHERE tenant_id = t_id AND kind = 'store' AND estate IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '132: the storehouse must stay estate-less so it shows under every estate';
  END IF;
END $$;
