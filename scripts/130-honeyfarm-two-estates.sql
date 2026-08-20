-- 130: HoneyFarm is two estates, not three, and code 500 was Sidapur all along.
--
-- Supersedes 125, which read the shape as three estates named HF, MV and PG. Confirmed with the
-- estate on 2026-08-20 it is two: **Honeyfarm** (blocks HF A/C and HF B) and **Sidapur** (blocks
-- MV and PG), sharing one storehouse.
--
-- THE PART THAT IS NOT A RENAME. HF A, HF B and HF C carry only dispatch and sales rows -- output.
-- Every cost sits on a fourth, bare "HF" block: 515 labour rows (Rs 19,01,274) and 270 expenses
-- (Rs 77,89,517), Rs 96,90,791 together, still being written to last week. That block is not one
-- of the two, and the two obvious ways to dispose of it are both wrong. Merging it into HF A/C
-- asserts a crore of spend happened on a block that has never carried a single cost row, which
-- would make HF B look free to run. Setting it to NULL is honest about the block but not the
-- estate -- unattributed rows show under *every* estate, so Sidapur would appear to have spent
-- Rs 96.9L it never touched, which is exactly the failure mode /api/dashboard/estate-attribution
-- exists to measure. So it stays, named for what it is: estate-level spend, correctly on Honeyfarm.
--
-- Sidapur gets the same treatment for the same reason. Code 500 "PG/MV Spend" is a place encoded
-- as an activity -- 125 said so and expected the code to have nothing left to do once estates
-- existed. It still has 23 rows carrying no block at all ("Pg mv april to may 1st", "Pgiri mvalli
-- 34 nos", "Bonus pg", "Mvalli shade work sunil"): known to the estate, unknown to the block. They
-- move to a Sidapur general block, so the money reaches the right estate without inventing which
-- of MV or PG it was spent on.
--
-- Rows that already name a block are left exactly where they are. Eight code-500 rows sit on MV or
-- PG and are already right; two sit on HF ("Pepper plants 200 nos" Rs 5,000, "Lent to pgiri fence
-- work" Rs 950) and were put there deliberately by someone who knew more than this migration does.
-- Overriding a human's explicit choice to satisfy a blanket rule is how you lose the one fact the
-- data had.

DO $$
DECLARE
  t_id        uuid;
  hf_bare     uuid;
  hf_a        uuid;
  hf_c        uuid;
  sidapur_gen uuid;
  moved       integer;
  ref         record;
  n           integer;
BEGIN
  SELECT id INTO t_id FROM tenants WHERE name = 'HoneyFarm';
  IF t_id IS NULL THEN
    RAISE NOTICE '130: no HoneyFarm tenant here, skipping';
    RETURN;
  END IF;

  SELECT id INTO hf_bare FROM locations WHERE tenant_id = t_id AND code = 'HF'   AND kind = 'block';
  SELECT id INTO hf_a    FROM locations WHERE tenant_id = t_id AND code = 'HF-A' AND kind = 'block';
  SELECT id INTO hf_c    FROM locations WHERE tenant_id = t_id AND code = 'HF-C' AND kind = 'block';

  -- ── HF A + HF C become one block ────────────────────────────────────────────────────────────
  -- Reassign by walking information_schema rather than naming tables: 24 carry location_id today
  -- and a hardcoded list silently misses the next one, leaving rows pointed at a deleted block.
  IF hf_a IS NOT NULL AND hf_c IS NOT NULL THEN
    FOR ref IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_name = c.table_name AND tb.table_schema = 'public' AND tb.table_type = 'BASE TABLE'
      WHERE c.column_name = 'location_id' AND c.table_schema = 'public'
    LOOP
      EXECUTE format('UPDATE %I SET location_id = $1 WHERE location_id = $2', ref.table_name)
        USING hf_a, hf_c;
    END LOOP;

    -- Nothing may still point at HF C before it is deleted.
    FOR ref IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_name = c.table_name AND tb.table_schema = 'public' AND tb.table_type = 'BASE TABLE'
      WHERE c.column_name = 'location_id' AND c.table_schema = 'public'
    LOOP
      EXECUTE format('SELECT COUNT(*) FROM %I WHERE location_id = $1', ref.table_name)
        INTO n USING hf_c;
      IF n > 0 THEN
        RAISE EXCEPTION '130: % still has % row(s) on HF C', ref.table_name, n;
      END IF;
    END LOOP;

    DELETE FROM locations WHERE id = hf_c;
    UPDATE locations SET name = 'HF A/C', code = 'HF-AC' WHERE id = hf_a;
  END IF;

  -- ── Estates ─────────────────────────────────────────────────────────────────────────────────
  UPDATE locations SET estate = 'Honeyfarm'
   WHERE tenant_id = t_id AND kind = 'block' AND code IN ('HF-AC', 'HF-A', 'HF-B', 'HF');
  UPDATE locations SET estate = 'Sidapur'
   WHERE tenant_id = t_id AND kind = 'block' AND code IN ('MV', 'PG');

  -- The bare HF block, named for what it actually holds.
  UPDATE locations SET name = 'Honeyfarm (general)' WHERE id = hf_bare;

  -- ── Sidapur's equivalent, and the code-500 rows that belong to it ────────────────────────────
  SELECT id INTO sidapur_gen FROM locations WHERE tenant_id = t_id AND code = 'SIDAPUR-GEN';
  IF sidapur_gen IS NULL THEN
    INSERT INTO locations (tenant_id, name, code, estate, kind)
    VALUES (t_id, 'Sidapur (general)', 'SIDAPUR-GEN', 'Sidapur', 'block')
    RETURNING id INTO sidapur_gen;
  END IF;

  UPDATE expense_transactions SET location_id = sidapur_gen
   WHERE tenant_id = t_id AND code = '500' AND location_id IS NULL;
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE '130: % code-500 expense row(s) -> Sidapur (general)', moved;

  UPDATE labor_transactions SET location_id = sidapur_gen
   WHERE tenant_id = t_id AND code = '500' AND location_id IS NULL;
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE '130: % code-500 labour row(s) -> Sidapur (general)', moved;

  -- ── Verify the shape we said we wanted ──────────────────────────────────────────────────────
  SELECT COUNT(*) INTO n FROM locations
   WHERE tenant_id = t_id AND kind = 'block' AND estate NOT IN ('Honeyfarm', 'Sidapur');
  IF n > 0 THEN
    RAISE EXCEPTION '130: % block(s) left outside the two estates', n;
  END IF;

  SELECT COUNT(*) INTO n FROM locations WHERE tenant_id = t_id AND kind = 'store';
  IF n <> 1 THEN
    RAISE EXCEPTION '130: expected exactly one shared storehouse, found %', n;
  END IF;

  -- The store stays estate NULL on purpose: lib/estate-filter.ts shows NULL-estate rows under
  -- every estate, which is precisely "one storehouse serving both".
  UPDATE locations SET estate = NULL WHERE tenant_id = t_id AND kind = 'store';
END $$;
