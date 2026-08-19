-- 127: shade management is four jobs, not one.
--
-- 145 Shade Lopping went in yesterday because Medappa's writer could not find the job he was
-- doing. Asked what "under lopping" meant, the estate owner gave the actual breakdown instead:
--
--   1) shade tree planting
--   2) shade tree pruning / lopping
--   3) Dadap / Glyricidia planting
--   4) Dadap / Glyricidia pruning
--
-- Two species groups -- permanent shade above, leguminous temporary shade below -- and planting
-- against pruning for each. That is a better answer than the question asked for, and it is worth
-- taking whole rather than bolting "Under Lopping" on as a fifth name for something already here.
--
-- 145's description is widened to the owner's own wording so it clearly covers lopping. Editing a
-- description is allowed; the code itself is fixed, which is the rule that keeps history readable.
--
-- WHAT IS DELIBERATELY NOT ADDED. A literal "Under Lopping" code. On their records it is 40
-- labourer-days and Rs 24,000, so it is real work -- but on this taxonomy it is almost certainly
-- 148, the Dadap/Glyricidia pruning: the lower tier of shade, under the permanent canopy. Adding
-- both would put the same job in the list twice under two names, which is exactly the disease
-- this list already has (133 Arabica Borer Tracing against 153 Pest Control, Berry Borer). One
-- question to the estate settles it; until then 148 is there to use.
--
-- Crop-neutral for the same reason 145 is: a shade tree is planted and lopped over whichever
-- coffee happens to be under it, and the deployment already carries a block.

INSERT INTO account_activities (tenant_id, code, activity)
SELECT t.id, v.code, v.activity
FROM tenants t
CROSS JOIN (VALUES
  ('146', 'Shade Tree Planting'),
  ('147', 'Dadap / Glyricidia Planting'),
  ('148', 'Dadap / Glyricidia Pruning')
) AS v(code, activity)
WHERE NOT EXISTS (
  SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code = v.code
)
-- Only estates already carrying the seeded structure; a tenant with none is either brand new
-- (provisioning seeds the full list) or has deliberately cleared it.
AND EXISTS (
  SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code IN ('134', '154')
);

-- Widen 145 to the owner's wording. Only where it still reads exactly as seeded, so an estate
-- that has already renamed it to suit itself is left alone.
UPDATE account_activities
SET activity = 'Shade Tree Pruning / Lopping'
WHERE code = '145' AND activity = 'Shade Lopping';

DO $$
DECLARE
  missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM tenants t
  CROSS JOIN (VALUES ('145'), ('146'), ('147'), ('148')) AS v(code)
  WHERE EXISTS (SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code IN ('134', '154'))
    AND NOT EXISTS (SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code = v.code);

  IF missing > 0 THEN
    RAISE EXCEPTION 'shade management codes missing in % tenant/code combination(s)', missing;
  END IF;
END $$;
