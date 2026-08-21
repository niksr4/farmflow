-- 133: estate-wide spend has somewhere to live that is not a piece of land.
--
-- 130 created "Honeyfarm (general)" and "Sidapur (general)" to hold cost that belongs to an estate
-- but not to any one block, and made them kind='block' because that was the only kind that could
-- receive cost. That was fine while a block was just a label. It stops being fine the moment
-- acreage matters, and acreage is now the first thing onboarding asks for.
--
-- WHY IT BREAKS. 99.4% of HoneyFarm's cost -- Rs 1,47,24,763 of Rs 1,48,16,732 -- sits on those
-- two pseudo-blocks. Cost per acre computed per block would divide Rs 12,650 by HF A/C's acreage
-- and Rs 0 by HF B's, and report that the estate's real blocks cost almost nothing to run, while
-- the crore of actual spend sat on a row with no area to divide by. A number that confident and
-- that wrong is worse than no number.
--
-- It also breaks setup: "every block has an area" can never be true for HoneyFarm, because two of
-- their six blocks describe an abstraction. They would have been stuck on step one forever.
--
-- THE MODEL. Three kinds, distinguished by what they physically are:
--
--   block   -- a piece of land. Has acreage. Work happens on it.
--   store   -- a shed. Holds stock. Has a footprint but no planted area.
--   general -- an estate, not a place. Holds spend that is real but not attributable to a block.
--
-- Cost per acre then has an honest definition at each level:
--   block cost per acre  = that block's cost / that block's acreage
--   estate cost per acre = every cost in the estate, general included / sum of its blocks' acreage
--
-- The second is the one that means anything for HoneyFarm today, and it is also what their owner
-- has twice said he wants -- the estate in general, not each block.
--
-- General locations stay fully selectable when recording cost. That is their entire job. They are
-- excluded from acreage denominators and from the "every block has an area" check, and nowhere
-- else.

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_kind_check;
ALTER TABLE locations ADD CONSTRAINT locations_kind_check
  CHECK (kind = ANY (ARRAY['block'::text, 'store'::text, 'general'::text]));

DO $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE locations SET kind = 'general'
   WHERE kind = 'block'
     AND code IN ('HF', 'SIDAPUR-GEN')
     AND tenant_id = (SELECT id FROM tenants WHERE name = 'HoneyFarm');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '133: % HoneyFarm location(s) reclassified as estate-general', n;

  -- A general location must never carry an area: it is not a piece of land, and any figure there
  -- would silently enter an acreage denominator it does not belong in.
  UPDATE locations SET area_acres = NULL WHERE kind = 'general' AND area_acres IS NOT NULL;

  SELECT COUNT(*) INTO n FROM locations WHERE kind = 'general' AND area_acres IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '133: % general location(s) still carry an area', n;
  END IF;
END $$;
