-- 102: Repair four Laxmi inventory transactions that were flipped restock -> deplete.
--
-- Background (2026-07-27): the Laxmi admin corrected the units on four May purchase
-- records (bags -> kg: Urea 60->3000, MOP 45->2250, DAP 40->2000; Robusta cherry
-- unchanged at 130). Saving them as "Restocking" was impossible: every one of these
-- legacy rows carries price = 0, and both the edit dialog and PUT
-- /api/transactions-neon/update reject a restock with a zero unit price. "Depleting"
-- has no such guard, so that is the save that went through — leaving four depletions
-- with no matching restock and zeroing his fertilizer stock.
--
-- This restores transaction_type = 'restock' (keeping the corrected quantities) and
-- replays current_inventory for the affected (item_type, location_id) pairs.
--
-- price stays 0: these rows were price 0 before the edit too, so inventing a cost basis
-- here would be worse than leaving it as it was. The tenant should re-enter real unit
-- prices — the same commit that adds this migration unblocks that path in the UI.
--
-- Idempotent: re-running is a no-op once the rows read 'restock'. Guarded on the Laxmi
-- tenant id, so it does nothing on any database that lacks that tenant (e.g. dev).

DO $$
DECLARE
  v_tenant_id uuid;
  v_nonzero_cost int;
  v_updated int;
BEGIN
  SELECT id INTO v_tenant_id
  FROM tenants
  WHERE LOWER(BTRIM(name)) = 'laxmi'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE '102: no Laxmi tenant on this database — skipping.';
    RETURN;
  END IF;

  -- The recompute below assumes a zero cost basis for these items. That is true today
  -- (every transaction for them has total_cost = 0). Fail loudly rather than silently
  -- writing a wrong avg_price if that ever stops being true.
  SELECT COUNT(*) INTO v_nonzero_cost
  FROM transaction_history
  WHERE tenant_id = v_tenant_id
    AND item_type IN ('Urea', 'MOP', 'DAP', 'Robusta cherry')
    AND COALESCE(total_cost, 0) <> 0;

  IF v_nonzero_cost > 0 THEN
    RAISE EXCEPTION '102: % transaction(s) for the repaired items carry a non-zero total_cost; '
      'the zero-cost recompute in this migration would be wrong. Recompute via '
      'recalculateInventoryForItem() instead.', v_nonzero_cost;
  END IF;

  UPDATE transaction_history
  SET transaction_type = 'restock'
  WHERE tenant_id = v_tenant_id
    AND transaction_type = 'deplete'
    AND (id, item_type) IN (
      (368, 'Urea'),
      (369, 'MOP'),
      (370, 'DAP'),
      (393, 'Robusta cherry')
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '102: restored % transaction(s) to restock.', v_updated;

  -- Replay current_inventory for every (item_type, location_id) pair these items touch.
  -- Mirrors lib/inventory-recalc.ts: quantity is the running restock/deplete balance
  -- clamped at zero; cost is zero for these items (asserted above).
  UPDATE current_inventory ci
  SET quantity = agg.quantity,
      total_cost = 0,
      avg_price = 0
  FROM (
    SELECT
      th.item_type,
      th.location_id,
      GREATEST(0, SUM(
        CASE
          WHEN LOWER(th.transaction_type) IN ('restock', 'restocking') THEN th.quantity
          ELSE -th.quantity
        END
      )) AS quantity
    FROM transaction_history th
    WHERE th.tenant_id = v_tenant_id
      AND th.item_type IN ('Urea', 'MOP', 'DAP', 'Robusta cherry')
    GROUP BY th.item_type, th.location_id
  ) AS agg
  WHERE ci.tenant_id = v_tenant_id
    AND ci.item_type = agg.item_type
    AND ci.location_id IS NOT DISTINCT FROM agg.location_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '102: recomputed % current_inventory row(s).', v_updated;
END $$;
