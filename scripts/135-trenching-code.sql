-- 135: trenching gets its own code instead of living inside Arabica weeding.
--
-- Requested by Gagan at Medappa, 2026-08-22. The work is not new -- `131 Arabica Weeding,
-- Trenching` already exists and is genuinely used: HoneyFarm 20 rows (Rs 64,875), Laxmi 5 rows
-- (Rs 22,860). What it cannot do is separate the two.
--
-- That is the same fault as shade lopping before scripts/124: a compound code records that money
-- was spent and hides what it was spent on. Weeding and trenching are different jobs done at
-- different times for different reasons -- weeding is upkeep, trenching is soil and moisture
-- conservation dug across the slope before the rains -- and 131 also scopes them to Arabica, when
-- a Robusta block needs trenches just as much.
--
-- So 149 is crop-agnostic and sits next to the shade-management block (145-148) added for the same
-- reason. It is free on every tenant.
--
-- HISTORY IS NOT MOVED. The 25 existing rows under 131 stay exactly where they are. Nobody now
-- knows which of them was weeding and which was trenching, and inventing that split would be
-- fabricating a number that reads as measured. From here the two are separable; before here they
-- are not, and the record should say so.
--
-- 131 keeps its name. Renaming it to "Arabica Weeding" would silently restate what those 25 rows
-- meant when they were entered.

INSERT INTO account_activities (tenant_id, code, activity)
SELECT t.id, '149', 'Trenching'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code = '149'
)
AND EXISTS (
  -- Only estates already on the standard list. A tenant with no codes at all is mid-provisioning
  -- and gets the full set from ensureDefaultActivityCodes instead.
  SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code IN ('131', '151')
);

DO $$
DECLARE
  missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM tenants t
  WHERE EXISTS (SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code IN ('131', '151'))
    AND NOT EXISTS (SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code = '149');

  IF missing > 0 THEN
    RAISE EXCEPTION '135: trenching code missing for % tenant(s)', missing;
  END IF;
END $$;
