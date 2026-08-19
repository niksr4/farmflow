-- 128: a store is where stock sits; a block is where work happens.
--
-- WHY. current_inventory is unique on (tenant_id, location_id, item_type, unit), so stock is
-- keyed by block. That asks which block a delivery belongs to at the moment it arrives, which is
-- exactly when nobody knows -- and when the answer is skipped or given twice you get the same
-- item as two balances. Laxmi has DAP twice: 2,000 kg on a block and 0 kg unassigned.
--
-- The tenants had already answered this by behaviour. Of 61 stock balances on production, 57 sit
-- on no block at all -- HoneyFarm 37 of 37, Seshagiri 11 of 11, Estate Mock 3 of 3. Only Laxmi
-- attached any, and that is the one that produced the duplicate.
--
-- So a store becomes a third kind of place, beside blocks rather than under them. An estate is a
-- grouping, a block is where work happens and carries acreage, a store is where stock sits. It is
-- deliberately NOT tied to an estate: HoneyFarm runs one store across HF, MV and PG, while a
-- future tenant with a shed per estate simply has several stores.
--
-- Implemented as a column on locations rather than a new table, so the existing foreign keys, RLS
-- policy and label helper all keep working -- 24 tables carry location_id and none of them need
-- to know this happened. Blocks keep pointing at blocks; only stock moves.
--
-- The block stays on the way OUT. An expense that consumes stock already carries location_id,
-- which is where per-block input cost comes from. What is being removed is the block on the
-- balance, not the block on the usage.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'block';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_kind_check') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_kind_check CHECK (kind IN ('block', 'store'));
  END IF;
END $$;

COMMENT ON COLUMN locations.kind IS
  'block = a field unit where work happens and acreage is measured. store = where stock is held. Stock balances point only at a store; every block picker filters to kind = ''block''.';

CREATE INDEX IF NOT EXISTS idx_locations_tenant_kind ON locations (tenant_id, kind);

-- One store per tenant that holds any stock or has ever moved any. A tenant with no inventory at
-- all does not need a shed inventing for it.
INSERT INTO locations (tenant_id, name, code, kind)
SELECT t.id, 'Main store', 'STORE', 'store'
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.tenant_id = t.id AND l.kind = 'store')
  AND (
    EXISTS (SELECT 1 FROM current_inventory ci WHERE ci.tenant_id = t.id)
    OR EXISTS (SELECT 1 FROM transaction_history th WHERE th.tenant_id = t.id)
  );

-- Merge before moving. Laxmi holds DAP as two rows -- one on a block, one unassigned -- and
-- pointing both at the same store would collide on uq_current_inventory_key. Quantity and cost
-- are summed because they are the same physical pile; avg_price is recomputed from the merged
-- totals rather than averaged, since averaging an average is wrong whenever the quantities differ.
--
-- Keyed on ctid, not id: current_inventory has no surrogate key at all -- its identity is
-- (tenant_id, location_id, item_type, unit) -- so the physical row pointer is the only way to
-- tell two rows of the same item apart long enough to fold them together.
UPDATE current_inventory ci
SET quantity   = m.quantity,
    total_cost = m.total_cost,
    avg_price  = CASE WHEN m.quantity > 0 THEN m.total_cost / m.quantity ELSE 0 END
FROM (
  SELECT tenant_id, item_type, unit,
         SUM(quantity)   AS quantity,
         SUM(total_cost) AS total_cost,
         MIN(ctid)       AS keep_ctid
  FROM current_inventory
  GROUP BY tenant_id, item_type, unit
  HAVING COUNT(*) > 1
) m
WHERE ci.ctid = m.keep_ctid;

DELETE FROM current_inventory ci
USING (
  SELECT tenant_id, item_type, unit, MIN(ctid) AS keep_ctid
  FROM current_inventory
  GROUP BY tenant_id, item_type, unit
  HAVING COUNT(*) > 1
) dupes
WHERE ci.tenant_id = dupes.tenant_id
  AND ci.item_type = dupes.item_type
  AND ci.unit IS NOT DISTINCT FROM dupes.unit
  AND ci.ctid <> dupes.keep_ctid;

-- Every balance now lives in its tenant's store.
UPDATE current_inventory ci
SET location_id = s.id
FROM locations s
WHERE s.tenant_id = ci.tenant_id
  AND s.kind = 'store'
  AND ci.location_id IS DISTINCT FROM s.id;

DO $$
DECLARE
  stranded INTEGER;
  duplicated INTEGER;
BEGIN
  SELECT COUNT(*) INTO stranded
  FROM current_inventory ci
  LEFT JOIN locations l ON l.id = ci.location_id
  WHERE l.id IS NULL OR l.kind <> 'store';
  IF stranded > 0 THEN
    RAISE EXCEPTION '% stock balance(s) are not in a store', stranded;
  END IF;

  SELECT COUNT(*) INTO duplicated FROM (
    SELECT tenant_id, item_type, unit FROM current_inventory
    GROUP BY tenant_id, item_type, unit HAVING COUNT(*) > 1
  ) d;
  IF duplicated > 0 THEN
    RAISE EXCEPTION '% item(s) still hold more than one balance', duplicated;
  END IF;
END $$;
