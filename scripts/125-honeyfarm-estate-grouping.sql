-- 125: HoneyFarm is three estates, and the app was never told.
--
-- HF, MV and PG are separate estates. All six of HoneyFarm's locations had estate = NULL, so the
-- estate dimension was not misused -- it was entirely unused, and every per-estate figure the app
-- can produce was unavailable to them. Medappa has always been set up correctly (Citrus Grove 13
-- blocks, Tirtha Estate 8), which is the shape this brings HoneyFarm to.
--
-- WHAT IT COST THEM. Without the dimension they invented a workaround: activity code 500
-- "PG/MV Spend", carrying Rs 4,97,180 across 33 rows. That is a *place* encoded as an *activity*,
-- and the actual activity ends up in free text -- "Mvalli shade work sunil", "Pg boundary danger
-- tree cutting". The same shape as Medappa filing everything under 101 with the real work in a
-- group name. Once estates exist, 500 has nothing left to do.
--
-- They were already self-correcting: every code-500 row from 2026-07-24 onward carries a real
-- location_id. This finishes what whoever did that had started.
--
-- NOTHING MOVES. This sets a grouping label on six rows. Every record keeps the location_id it
-- has; they simply become reachable by estate. No cost, no total and no report changes value --
-- filters that were previously unavailable start working.
--
-- WHY 'HF' STAYS A LOCATION. It holds 507 labour rows (Rs 18,29,174), 262 expenses (Rs 77,27,286)
-- and 56 processing records -- essentially all of HoneyFarm's operational history. It is the
-- estate-wide bucket in practice, so it stays as a location *under* estate HF rather than being
-- dissolved. Renaming it to something clearer is a separate, cosmetic decision for the estate.
--
-- Worth recording for later: HF A, HF B and HF C carry zero labour and zero expense. They are
-- used only to tag dispatches and sales, which makes them outbound batch labels rather than
-- blocks where work happens. Per-block cost analysis for HoneyFarm will therefore be empty until
-- they start attributing work to them -- that is a habit change, not a schema one.

-- Authoritative for these six names rather than conditional on the current value. The first
-- draft only touched rows where estate IS NULL, which is true on production but not on dev --
-- where HoneyFarm's locations had somehow acquired *Medappa's* estate names ("HF C" and "PG"
-- under Citrus Grove, the rest under Tirtha Estate), almost certainly from a demo seed or a
-- harness. A migration that silently does nothing when the data is wrong in an unexpected way
-- is worse than one that states the answer, so this states it.
UPDATE locations
SET estate = CASE
  WHEN name IN ('HF', 'HF A', 'HF B', 'HF C') THEN 'HF'
  WHEN name = 'MV' THEN 'MV'
  WHEN name = 'PG' THEN 'PG'
END
WHERE tenant_id = (SELECT id FROM tenants WHERE name = 'HoneyFarm')
  AND name IN ('HF', 'HF A', 'HF B', 'HF C', 'MV', 'PG')
  AND estate IS DISTINCT FROM CASE
    WHEN name IN ('HF', 'HF A', 'HF B', 'HF C') THEN 'HF'
    WHEN name = 'MV' THEN 'MV'
    WHEN name = 'PG' THEN 'PG'
  END;

-- Prove it landed, and that nothing was left behind. A HoneyFarm location with no estate after
-- this either means a name changed under us or a new one appeared, and both want a human.
DO $$
DECLARE
  tenant UUID;
  orphaned INTEGER;
  grouped INTEGER;
BEGIN
  SELECT id INTO tenant FROM tenants WHERE name = 'HoneyFarm';
  IF tenant IS NULL THEN
    RAISE NOTICE 'No HoneyFarm tenant on this instance -- nothing to group.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO orphaned FROM locations WHERE tenant_id = tenant AND estate IS NULL;
  SELECT COUNT(DISTINCT estate) INTO grouped FROM locations WHERE tenant_id = tenant AND estate IS NOT NULL;

  IF orphaned > 0 THEN
    RAISE EXCEPTION 'HoneyFarm still has % location(s) with no estate -- check their names', orphaned;
  END IF;

  IF grouped <> 3 THEN
    RAISE EXCEPTION 'expected HoneyFarm to resolve to 3 estates, got %', grouped;
  END IF;
END $$;
