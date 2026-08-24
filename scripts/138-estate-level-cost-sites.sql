-- 138: every named estate gets a place for costs that belong to the estate, not to a block.
--
-- Electricity, the phone bill, an audit fee, a watchman. They belong to a property, and forcing
-- them onto a block puts a cost per acre on land that never saw the money.
--
-- HoneyFarm already worked this way -- "Honeyfarm (general)" and "Sidapur (general)", holding 99.4%
-- of their spend -- because scripts/130 created those rows when their two estates were separated.
-- Nobody created the equivalent for anyone else, so:
--
--   Medappa Estates  2 estates (Citrus Grove, Tirtha Estate), NO estate-level row for either.
--                    An electricity bill for Citrus Grove could only go onto one of its 13 blocks,
--                    or onto "whole estate" (NULL) which spans Tirtha as well. Both are wrong, and
--                    they are the only tenant where the wrongness is unavoidable rather than
--                    merely untidy.
--   Laxmi            1 estate. NULL happens to mean the same thing when there is only one, so
--                    nothing was broken -- but the row makes the report say "Laxmi" instead of
--                    leaving a blank, and it stops being equivalent the day they add a second.
--
-- Seshagiri and greenvalley name no estates at all, so there is nothing to attach a row to. They
-- are skipped, not fixed: inventing an estate name for them would be inventing a fact.
--
-- WHY kind='general' AND NOT A BLOCK. scripts/133 made the distinction: a block is land and has
-- acreage, a store holds stock, a general location is neither -- it is the estate itself as a
-- thing spend can name. acreageSitesForEstate() counts only blocks, so these rows can never dilute
-- a per-acre figure; costSitesForEstate() includes them, so they appear wherever a cost is
-- recorded. Making them blocks instead would have quietly added zero-acre land to every
-- denominator.

INSERT INTO locations (tenant_id, name, code, estate, kind, area_acres)
SELECT DISTINCT
  l.tenant_id,
  l.estate || ' (general)',
  upper(regexp_replace(l.estate, '[^a-zA-Z0-9]+', '-', 'g')) || '-GEN',
  l.estate,
  'general',
  -- Cast, because a bare NULL in a SELECT list is typed `text` and the column is numeric.
  NULL::numeric
FROM locations l
WHERE l.estate IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM locations g
    WHERE g.tenant_id = l.tenant_id AND g.kind = 'general' AND g.estate = l.estate
  )
ON CONFLICT (tenant_id, code) DO NOTHING;

DO $$
DECLARE
  uncovered INTEGER;
  bad_acreage INTEGER;
BEGIN
  -- Every named estate can now name itself.
  SELECT COUNT(*) INTO uncovered
  FROM (
    SELECT DISTINCT tenant_id, estate FROM locations WHERE estate IS NOT NULL
  ) e
  WHERE NOT EXISTS (
    SELECT 1 FROM locations g
    WHERE g.tenant_id = e.tenant_id AND g.kind = 'general' AND g.estate = e.estate
  );

  IF uncovered > 0 THEN
    RAISE EXCEPTION '138: % named estate(s) still have nowhere to put an estate-level cost', uncovered;
  END IF;

  -- An estate is not land. A general row carrying acreage would inflate every per-acre denominator
  -- it touches, which is the exact failure kind='general' exists to prevent.
  SELECT COUNT(*) INTO bad_acreage
  FROM locations WHERE kind = 'general' AND area_acres IS NOT NULL;

  IF bad_acreage > 0 THEN
    RAISE EXCEPTION '138: % general location(s) carry acreage', bad_acreage;
  END IF;
END $$;
