-- 105: Finish the HoneyFarm ledger resync — the one item migration 104 missed.
--
-- 104 matched item names exactly and listed '24d'. The actual item is '24d ' with a TRAILING
-- SPACE, so it matched nothing and was left drifting (balance 3.5, ledger replays to 5.5).
-- This repeats 104's treatment for it, matching on BTRIM so stray whitespace in a name cannot
-- cause the same miss again.
--
-- Same contract as 104: history for the affected item is archived, then replaced with a single
-- opening balance equal to the current book value. No quantity or value visible to HoneyFarm
-- changes; the migration aborts if any balance moves.

DO $$
DECLARE
  v_tenant_id uuid;
  v_archived int;
  v_opened int;
  v_bad int;
  v_actor uuid;
  v_cutover timestamptz := date_trunc('day', now());
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE LOWER(BTRIM(name)) = 'honeyfarm' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE '105: no HoneyFarm tenant here — skipping.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM transaction_history
    WHERE tenant_id = v_tenant_id AND BTRIM(item_type) = '24d'
      AND notes LIKE 'Opening balance — ledger resynced%'
  ) THEN
    RAISE NOTICE '105: already resynced — nothing to do.';
    RETURN;
  END IF;

  SELECT id INTO v_actor FROM users
  WHERE tenant_id = v_tenant_id AND role IN ('admin', 'owner')
  ORDER BY created_at ASC LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '105: no admin user to attribute the opening balance to.';
  END IF;

  CREATE TEMP TABLE hf24_targets ON COMMIT DROP AS
    SELECT item_type, location_id, COALESCE(quantity,0) AS quantity,
           COALESCE(total_cost,0) AS total_cost, COALESCE(avg_price,0) AS avg_price, unit
    FROM current_inventory
    WHERE tenant_id = v_tenant_id AND BTRIM(item_type) = '24d';

  INSERT INTO transaction_history_archive (
    archived_by, reason, original_id, tenant_id, item_type, quantity, transaction_type,
    notes, transaction_date, user_id, price, total_cost, location_id, unit)
  SELECT 'migration/105', 'ledger resync — history incomplete for this item',
         id, tenant_id, item_type, quantity, transaction_type, notes, transaction_date,
         user_id, price, total_cost, location_id, unit
  FROM transaction_history
  WHERE tenant_id = v_tenant_id AND BTRIM(item_type) = '24d';
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  DELETE FROM transaction_history
  WHERE tenant_id = v_tenant_id AND BTRIM(item_type) = '24d';

  INSERT INTO transaction_history (
    item_type, quantity, transaction_type, notes, transaction_date,
    user_id, user_uuid, price, total_cost, tenant_id, location_id, unit)
  SELECT t.item_type, t.quantity, 'restock',
         'Opening balance — ledger resynced ' || to_char(v_cutover, 'YYYY-MM-DD') ||
           '. Earlier history for this item was incomplete and is archived.',
         v_cutover, 'system', v_actor,
         CASE WHEN t.quantity > 0 THEN t.total_cost / t.quantity ELSE 0 END,
         t.total_cost, v_tenant_id, t.location_id, COALESCE(t.unit, 'kg')
  FROM hf24_targets t
  WHERE t.quantity <> 0 OR t.total_cost <> 0;
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  UPDATE current_inventory ci
  SET quantity = t.quantity, total_cost = t.total_cost, avg_price = t.avg_price
  FROM hf24_targets t
  WHERE ci.tenant_id = v_tenant_id
    AND ci.item_type = t.item_type
    AND ci.location_id IS NOT DISTINCT FROM t.location_id;

  SELECT COUNT(*) INTO v_bad
  FROM current_inventory ci
  JOIN hf24_targets t
    ON t.item_type = ci.item_type AND t.location_id IS NOT DISTINCT FROM ci.location_id
  WHERE ci.tenant_id = v_tenant_id
    AND (ABS(COALESCE(ci.quantity,0) - t.quantity) > 0.001
         OR ABS(COALESCE(ci.total_cost,0) - t.total_cost) > 0.01);

  IF v_bad > 0 THEN
    RAISE EXCEPTION '105: % balance(s) moved during the resync — rolling back.', v_bad;
  END IF;

  RAISE NOTICE '105: archived % row(s), wrote % opening balance(s). Balances unchanged.',
    v_archived, v_opened;
END $$;
