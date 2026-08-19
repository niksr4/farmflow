-- 129: losing stock is a cost, and it needs somewhere to land.
--
-- Step 5. Taking stock out had two paths -- deplete it on the Inventory tab, or record an expense
-- that consumes it -- and no rule for which. That ambiguity is why 91% of all consumption across
-- every tenant is valued at zero, and why Laxmi used neither path and simply stopped.
--
-- Everything that leaves the store should leave through an expense, so it carries a code, a block
-- and a value. But manual depletion cannot just be deleted: HoneyFarm has done it 133 times,
-- Seshagiri 27. What those depletions lacked was not a reason to exist -- spillage, a torn bag, a
-- stock count that came up short are all real -- but anywhere to be counted. A depletion with no
-- activity code is cost that reaches no P&L line, which is the same fault as the muster
-- allocations that saved and counted nowhere, and the pepper revenue six routes could not see.
--
-- So the Inventory tab's depletion becomes an expense under this code: valued from the average
-- cost like any other usage, visible in Costs, and reaching the P&L. One path out of the store.
--
-- 123 Tools And Implements and 122 Miscellaneous are the nearest existing codes and neither is
-- right -- a spilled bag of urea is not a tool, and "miscellaneous" is the drain the codes review
-- recommended retiring after finding Rs 54,35,913 in it. 124 is free on every tenant, and sits in
-- the estate-overhead range where the other cannot-be-helped costs live.

INSERT INTO account_activities (tenant_id, code, activity)
SELECT t.id, '124', 'Stock Loss & Wastage'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code = '124'
)
AND EXISTS (
  SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code IN ('134', '154')
);

DO $$
DECLARE
  missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM tenants t
  WHERE EXISTS (SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code IN ('134', '154'))
    AND NOT EXISTS (SELECT 1 FROM account_activities a WHERE a.tenant_id = t.id AND a.code = '124');

  IF missing > 0 THEN
    RAISE EXCEPTION 'stock loss code missing for % tenant(s)', missing;
  END IF;
END $$;
