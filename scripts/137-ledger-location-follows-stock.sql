-- 137: put every stock movement in the shed its balance actually lives in.
--
-- The ledger and the balances disagree about where stock is, on every tenant:
--
--   Laxmi       6 rows on "House Block" (a BLOCK), 3 with no location   -> 8 balances on Main store
--   HoneyFarm   362 rows with no location, 5 on the store               -> 37 balances on Main store
--   Seshagiri   43 rows with no location                                -> 11 balances on Main store
--   Estate Mock 8 rows with no location                                 -> 3 balances on Main store
--
-- The balances were moved to stores when stores stopped being blocks (scripts/128). The history
-- was not, so `transaction_history.location_id` still says where stock was recorded *before* that
-- distinction existed -- and for Laxmi it says a block, which is a place stock is used, never held.
--
-- WHY THIS IS NOT COSMETIC. `recalculateInventoryForItem` rebuilds a balance from the ledger with
-- `location_id IS NOT DISTINCT FROM <location>`. It runs on every transaction edit and every
-- transaction delete. Today, editing one of Laxmi's six rows would recompute the slot for *House
-- Block* -- which has no balance row -- and insert one, leaving the real Main store row untouched
-- and now wrong. The item then appears twice with two different quantities, and the ledger agrees
-- with neither. Nobody has edited one of those rows yet. That is the only reason this has not
-- happened.
--
-- It also means the transaction history screen shows a block in its location column for stock that
-- has only ever sat in the shed, which is what prompted this.
--
-- THE RULE. A movement belongs to the store that holds that item's balance. Applied only where
-- that store is unambiguous:
--
--   * the item has exactly one balance row, and that row is on a `store`; or
--   * the tenant has exactly one store at all.
--
-- Anything ambiguous is left alone and reported by the verifier below rather than guessed. Medappa
-- is the only tenant with two stores and has no stock yet, so nothing is ambiguous today -- but
-- the rule has to be written for the day they do, because guessing which of two sheds a historical
-- movement came from is inventing a fact.
--
-- QUANTITIES ARE NOT TOUCHED. Only location_id moves. The balances are the ones the estates have
-- been operating on and they reconcile against the ledger's arithmetic exactly; this makes the
-- ledger agree about *where*, and changes nothing about *how much*.

-- CTEs, not TEMP tables. The migration runner sends each statement over Neon's HTTP driver, where
-- every statement is its own session -- a TEMP table created by one is gone before the next runs,
-- and the failure is "relation does not exist", which reads like a typo rather than a lifetime.
--
-- `(array_agg(id))[1]` because Postgres has no MIN(uuid). Safe: HAVING COUNT(*) = 1 means there is
-- exactly one to take.

-- Rule 1, which wins: a movement belongs to the store holding that item's balance.
WITH item_home AS (
  SELECT ci.tenant_id, ci.item_type, (array_agg(l.id))[1] AS store_id
  FROM current_inventory ci
  JOIN locations l ON l.id = ci.location_id AND l.kind = 'store'
  GROUP BY ci.tenant_id, ci.item_type
  HAVING COUNT(*) = 1
)
UPDATE transaction_history th
SET location_id = h.store_id
FROM item_home h
WHERE th.tenant_id = h.tenant_id
  AND th.item_type = h.item_type
  AND th.location_id IS DISTINCT FROM h.store_id;

-- Rule 2, for what rule 1 could not place: an item with no balance row at all, which is every
-- fully-consumed or since-deleted item. Only where the tenant has exactly one store, so there is
-- nothing to guess.
WITH sole_store AS (
  SELECT tenant_id, (array_agg(id))[1] AS store_id
  FROM locations WHERE kind = 'store'
  GROUP BY tenant_id HAVING COUNT(*) = 1
), item_home AS (
  SELECT ci.tenant_id, ci.item_type
  FROM current_inventory ci
  JOIN locations l ON l.id = ci.location_id AND l.kind = 'store'
  GROUP BY ci.tenant_id, ci.item_type
  HAVING COUNT(*) = 1
)
UPDATE transaction_history th
SET location_id = s.store_id
FROM sole_store s
WHERE th.tenant_id = s.tenant_id
  AND th.location_id IS DISTINCT FROM s.store_id
  AND NOT EXISTS (
    SELECT 1 FROM item_home h WHERE h.tenant_id = th.tenant_id AND h.item_type = th.item_type
  );

DO $$
DECLARE
  on_block INTEGER;
  homeless INTEGER;
  ambiguous INTEGER;
BEGIN
  SELECT COUNT(*) INTO on_block
  FROM transaction_history th
  JOIN locations l ON l.id = th.location_id
  WHERE l.kind <> 'store';

  IF on_block > 0 THEN
    RAISE EXCEPTION '137: % stock movement(s) still sit on a non-store location', on_block;
  END IF;

  -- Rows left with no location. Allowed only for a tenant that genuinely has no store to put them
  -- in -- otherwise the update above should have placed every one of them.
  SELECT COUNT(*) INTO homeless
  FROM transaction_history th
  WHERE th.location_id IS NULL
    AND EXISTS (SELECT 1 FROM locations l WHERE l.tenant_id = th.tenant_id AND l.kind = 'store');

  IF homeless > 0 THEN
    RAISE EXCEPTION '137: % movement(s) have no location despite their tenant having a store', homeless;
  END IF;

  SELECT COUNT(DISTINCT th.tenant_id) INTO ambiguous
  FROM transaction_history th
  WHERE th.location_id IS NULL;

  IF ambiguous > 0 THEN
    RAISE NOTICE '137: % tenant(s) have movements with no location and no store to assign them to', ambiguous;
  END IF;
END $$;
