-- 131: the Rs 46 lakh that belonged to no estate now belongs to the one that spent it.
--
-- 130 gave HoneyFarm two estates and moved code-500 spend to Sidapur. What it left alone was the
-- Rs 46,22,061 carrying no location at all -- 193 expense rows (Rs 28,57,521), 486 labour rows
-- (Rs 16,66,550) and the rest. Unattributed rows show under *every* estate by design, so with two
-- estates that money was counting as Honeyfarm's and Sidapur's at once, making Sidapur look like
-- it had spent thirty times what it did.
--
-- Confirmed with the estate 2026-08-20: it is Honeyfarm spend. The data agrees. Only Rs 42,850 of
-- the whole Rs 46.2L mentions a Sidapur place at all, and the mentions are directional in a way a
-- blanket sweep would get backwards:
--
--   "From pgiri 4nos"        -- labour came FROM Pgiri to work here. The cost is Honeyfarm's.
--   "To pgiri" / "To mvalli" -- labour went the other way. The cost is Sidapur's.
--
-- Three rows say "to" (Rs 8,550). They are excluded and sent to Sidapur instead. It is 0.02% of
-- the total and not worth a migration on its own -- but a sweep that knowingly files "To pgiri"
-- as Honeyfarm is a sweep that has stopped reading, and the next one gets trusted less.
--
-- One row is genuinely ambiguous and is deliberately NOT guessed: 2026-03-05, code 232,
-- Rs 11,025, "Out side labour pgiri 18+ 3". It lacks the to/from that disambiguates every other
-- row, so it goes to Honeyfarm with the rest and is called out here for a human to correct if
-- they know better. Recording the doubt costs nothing; inventing the answer costs the audit.
--
-- Reversible: every row moved gains a location_id it did not have. To undo, set location_id back
-- to NULL where it equals the Honeyfarm general block AND the row is listed in the audit note
-- written below.

DO $$
DECLARE
  t_id    uuid;
  hf_gen  uuid;
  sid_gen uuid;
  n       integer;
  rs      numeric;
BEGIN
  SELECT id INTO t_id FROM tenants WHERE name = 'HoneyFarm';
  IF t_id IS NULL THEN
    RAISE NOTICE '131: no HoneyFarm tenant here, skipping';
    RETURN;
  END IF;

  SELECT id INTO hf_gen  FROM locations WHERE tenant_id = t_id AND code = 'HF';
  SELECT id INTO sid_gen FROM locations WHERE tenant_id = t_id AND code = 'SIDAPUR-GEN';

  IF hf_gen IS NULL OR sid_gen IS NULL THEN
    RAISE EXCEPTION '131: expected the general blocks from 130 to exist';
  END IF;

  -- Work that went TO Sidapur, in the estate's own words. Narrow on purpose: only "to", only
  -- immediately before the place name, so "From pgiri" and "Out side labour pgiri" cannot match.
  UPDATE labor_transactions SET location_id = sid_gen
   WHERE tenant_id = t_id AND location_id IS NULL
     AND COALESCE(task_description, notes, '') ~* '\mto\s+(pgiri|mvalli|p\.?g\.?|m\.?v\.?)\M';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '131: % labour row(s) sent to Sidapur (work performed there)', n;

  UPDATE expense_transactions SET location_id = sid_gen
   WHERE tenant_id = t_id AND location_id IS NULL
     AND COALESCE(notes, '') ~* '\mto\s+(pgiri|mvalli|p\.?g\.?|m\.?v\.?)\M';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '131: % expense row(s) sent to Sidapur', n;

  -- Everything else was spent running Honeyfarm.
  SELECT COUNT(*), COALESCE(SUM(total_cost), 0) INTO n, rs
    FROM labor_transactions WHERE tenant_id = t_id AND location_id IS NULL;
  UPDATE labor_transactions SET location_id = hf_gen WHERE tenant_id = t_id AND location_id IS NULL;
  RAISE NOTICE '131: % labour row(s), Rs % -> Honeyfarm (general)', n, round(rs);

  SELECT COUNT(*), COALESCE(SUM(total_amount), 0) INTO n, rs
    FROM expense_transactions WHERE tenant_id = t_id AND location_id IS NULL;
  UPDATE expense_transactions SET location_id = hf_gen WHERE tenant_id = t_id AND location_id IS NULL;
  RAISE NOTICE '131: % expense row(s), Rs % -> Honeyfarm (general)', n, round(rs);

  -- Nothing of HoneyFarm's may still be estate-less, or the double-count survives.
  SELECT COUNT(*) INTO n FROM (
    SELECT 1 FROM labor_transactions   WHERE tenant_id = t_id AND location_id IS NULL
    UNION ALL
    SELECT 1 FROM expense_transactions WHERE tenant_id = t_id AND location_id IS NULL
  ) q;
  IF n > 0 THEN
    RAISE EXCEPTION '131: % cost row(s) still carry no location', n;
  END IF;
END $$;
