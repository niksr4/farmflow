-- 126: Laxmi's four blocks all display as "Laxmi".
--
-- Nothing is structurally wrong here -- these are four real, distinct blocks and their codes have
-- always been right (HOUSE-BLOCK, GEETHA-BLOCK, LAXMI-STORE-BLOCK, LAXMI-MEKOOR-BLOCK). Only the
-- `name` field was left as the estate's own name on all four, almost certainly because three of
-- them were created in one sitting on 2026-07-27 and naming was skipped.
--
-- The app already copes: formatLocationLabel appends the code when names collide, so the picker
-- reads "Laxmi (GEETHA-BLOCK)" rather than four identical rows. That is a safety net working, not
-- a reason to leave it -- the writer still has to know which code is which yard.
--
-- Matched on CODE, not name, because the names are indistinguishable and matching on them would
-- hit all four rows with whatever the first CASE arm returned.
--
-- The estate's own name is dropped from the two prefixed codes: every block here belongs to
-- Laxmi, so repeating it in the label costs width on a phone and adds nothing. Renaming is
-- cosmetic and reversible -- id and code are the identity, and every record keeps its location_id
-- untouched, so no cost, total or report moves.

UPDATE locations SET name = 'House Block'
WHERE tenant_id = (SELECT id FROM tenants WHERE name = 'Laxmi') AND code = 'HOUSE-BLOCK';

UPDATE locations SET name = 'Geetha Block'
WHERE tenant_id = (SELECT id FROM tenants WHERE name = 'Laxmi') AND code = 'GEETHA-BLOCK';

UPDATE locations SET name = 'Store Block'
WHERE tenant_id = (SELECT id FROM tenants WHERE name = 'Laxmi') AND code = 'LAXMI-STORE-BLOCK';

UPDATE locations SET name = 'Mekoor Block'
WHERE tenant_id = (SELECT id FROM tenants WHERE name = 'Laxmi') AND code = 'LAXMI-MEKOOR-BLOCK';

-- No two blocks should still share a display name once this has run.
DO $$
DECLARE
  tenant UUID;
  collisions INTEGER;
BEGIN
  SELECT id INTO tenant FROM tenants WHERE name = 'Laxmi';
  IF tenant IS NULL THEN
    RAISE NOTICE 'No Laxmi tenant on this instance -- nothing to rename.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO collisions FROM (
    SELECT LOWER(TRIM(name)) AS n
    FROM locations
    WHERE tenant_id = tenant
    GROUP BY LOWER(TRIM(name))
    HAVING COUNT(*) > 1
  ) dupes;

  IF collisions > 0 THEN
    RAISE EXCEPTION 'Laxmi still has % duplicated block name(s) after renaming', collisions;
  END IF;
END $$;
