-- 124: give every existing estate a code for shade lopping.
--
-- WHY. Medappa's writer opened the muster on his first morning, went looking for "Shade Looping"
-- and could not find it. The nearest entries were 134 Arabica Shade Work and 154 Robusta Shade
-- Temp, Perm. -- neither of which is what the estate calls the job.
--
-- It is not a marginal omission. On their own history shade lopping is 52 labourer-days and
-- Rs 41,600, the second-largest activity after general permanent labour, and together with under
-- lopping it is 28% of everything they spend on labour. It had no code because every one of
-- their legacy rows was filed under 101 Salaries And Allowances with the real work typed into a
-- free-text group name -- which is also why "what did shade lopping cost last season" cannot be
-- answered from their history, and can be from today onward.
--
-- CROP-NEUTRAL, ON PURPOSE. A shade tree is lopped over whichever coffee is under it; the
-- operation is about the canopy, not the crop. Duplicating it into an Arabica and a Robusta
-- version would repeat the pattern that has already left this list with 133 Arabica Borer Tracing
-- against 153 Pest Control, Berry Borer for the same job under different words. The deployment
-- carries a block, and the block says which crop. 150 Drip line Maintenance is the existing
-- precedent for a neutral code in this range.
--
-- lib/account-activity-suggestions.ts carries the same addition so new tenants are seeded with
-- it; this is only for the estates that already exist.
--
-- Idempotent, and it never touches a tenant that has already made 145 mean something else.

INSERT INTO account_activities (tenant_id, code, activity)
SELECT t.id, '145', 'Shade Lopping'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM account_activities a
  WHERE a.tenant_id = t.id AND a.code = '145'
)
-- Only estates that already have the seeded structure. A tenant with no codes at all is either
-- brand new (provisioning will seed the full list, this one included) or has deliberately
-- cleared it, and neither wants a single code appearing on its own.
AND EXISTS (
  SELECT 1 FROM account_activities a
  WHERE a.tenant_id = t.id AND a.code IN ('134', '154')
);

DO $$
DECLARE
  missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM tenants t
  WHERE EXISTS (SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code IN ('134', '154'))
    AND NOT EXISTS (SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code = '145');

  IF missing > 0 THEN
    RAISE EXCEPTION 'shade lopping missing for % tenant(s) that should have it', missing;
  END IF;
END $$;
