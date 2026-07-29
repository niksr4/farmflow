-- 104: Resync HoneyFarm's inventory ledger to its current balances, for the six items whose
--      history is provably incomplete. Quantities and values are NOT changed by this migration.
--
-- Background. current_inventory (the running balance) and transaction_history (the ledger) had
-- drifted. Replaying the ledger the way recalculateInventoryForItem does shows 37 slots, of
-- which:
--   * 29 reconcile exactly — untouched here.
--   * 2 (Fix, Mop red) differ only because something was entered dated earlier than the stock
--     covering it. The stored balance is correct there; nothing to repair.
--   * 6 cannot be explained by any ordering, i.e. restock rows are genuinely missing:
--
--       item                      balance says      ledger replays to
--       Sumo Carbofuran Granules  20   (Rs 2,764)   50   (Rs 5,691)
--       24d                       3.5  (Rs   159)   5.5  (Rs   250)
--       Copper Sulphate           360  (Rs108,540)  324  (Rs108,540)
--       Bud builder               0    (Rs     0)   30   (Rs 43,500)
--       DAP                       4500 (Rs 71,138)  4150 (Rs 62,470)
--       Contaf                    11.5 (Rs     0)   187  (Rs      0)
--
-- Why a reset rather than correcting entries. Three of the six need a depletion larger than the
-- stock on hand, and update_inventory() raises 'Insufficient stock' on exactly that — correctly,
-- since you cannot consume what was never received. The corrective rows are therefore
-- un-insertable through any normal path. So for these six items only, the unreliable history is
-- archived and replaced with a single opening balance equal to the current book value.
--
-- What is preserved. 343 of 380 ledger rows are untouched, so the Transaction History tab keeps
-- almost all of its content. The 37 archived rows are copied to transaction_history_archive
-- first and can be restored from there.
--
-- The owner's decision (2026-07-29) was to treat current_inventory as correct for both quantity
-- and value, and start clean; the estate can adjust individual figures afterwards through the UI.
-- No quantity or value visible to HoneyFarm changes as a result of this migration — it is
-- verified at the end and the migration aborts if any slot moved.

CREATE TABLE IF NOT EXISTS transaction_history_archive (
  archive_id     bigserial PRIMARY KEY,
  archived_at    timestamptz NOT NULL DEFAULT now(),
  archived_by    text        NOT NULL,
  reason         text        NOT NULL,
  original_id    bigint,
  tenant_id      uuid,
  item_type      text,
  quantity       numeric,
  transaction_type text,
  notes          text,
  transaction_date timestamptz,
  user_id        text,
  price          numeric,
  total_cost     numeric,
  location_id    uuid,
  unit           text
);

DO $$
DECLARE
  v_tenant_id uuid;
  v_items text[] := ARRAY['Sumo Carbofuran Granules', '24d', 'Copper Sulphate',
                          'Bud builder', 'DAP', 'Contaf'];
  v_archived int;
  v_deleted int;
  v_opened int;
  v_bad int;
  v_actor uuid;
  v_cutover timestamptz := date_trunc('day', now());
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE LOWER(BTRIM(name)) = 'honeyfarm' LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE '104: no HoneyFarm tenant on this database — skipping.';
    RETURN;
  END IF;

  -- Idempotency: if the opening balances already exist, this has run.
  IF EXISTS (
    SELECT 1 FROM transaction_history
    WHERE tenant_id = v_tenant_id AND notes LIKE 'Opening balance — ledger resynced%'
  ) THEN
    RAISE NOTICE '104: opening balances already present — nothing to do.';
    RETURN;
  END IF;

  -- transaction_history.user_uuid is NOT NULL, so the opening rows need a real author.
  -- Attribute them to the tenant's earliest admin — the closest thing to "the estate" — rather
  -- than inventing an id that would dangle.
  SELECT id INTO v_actor
  FROM users
  WHERE tenant_id = v_tenant_id AND role IN ('admin', 'owner')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION '104: no admin user for the tenant to attribute the opening balances to.';
  END IF;

  -- Remember every balance so we can prove none of them moved.
  CREATE TEMP TABLE hf_targets ON COMMIT DROP AS
    SELECT item_type, location_id, COALESCE(quantity, 0) AS quantity,
           COALESCE(total_cost, 0) AS total_cost, COALESCE(avg_price, 0) AS avg_price, unit
    FROM current_inventory
    WHERE tenant_id = v_tenant_id;

  -- 1. Archive the unreliable rows before removing them.
  INSERT INTO transaction_history_archive (
    archived_by, reason, original_id, tenant_id, item_type, quantity, transaction_type,
    notes, transaction_date, user_id, price, total_cost, location_id, unit)
  SELECT 'migration/104', 'ledger resync — history incomplete for this item',
         id, tenant_id, item_type, quantity, transaction_type, notes, transaction_date,
         user_id, price, total_cost, location_id, unit
  FROM transaction_history
  WHERE tenant_id = v_tenant_id AND item_type = ANY(v_items);
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  DELETE FROM transaction_history
  WHERE tenant_id = v_tenant_id AND item_type = ANY(v_items);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 2. One opening balance per slot that actually holds something. Slots at zero need no row:
  --    an empty ledger already replays to zero.
  INSERT INTO transaction_history (
    item_type, quantity, transaction_type, notes, transaction_date,
    user_id, user_uuid, price, total_cost, tenant_id, location_id, unit)
  SELECT t.item_type, t.quantity, 'restock',
         'Opening balance — ledger resynced ' || to_char(v_cutover, 'YYYY-MM-DD') ||
           '. Earlier history for this item was incomplete and is archived.',
         v_cutover, 'system', v_actor,
         CASE WHEN t.quantity > 0 THEN t.total_cost / t.quantity ELSE 0 END,
         t.total_cost, v_tenant_id, t.location_id, COALESCE(t.unit, 'kg')
  FROM hf_targets t
  WHERE t.item_type = ANY(v_items)
    AND (t.quantity <> 0 OR t.total_cost <> 0);
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  -- 3. The AFTER INSERT trigger has just added those quantities on top of the balances that
  --    were already there. Put every balance back exactly as it was — this migration must not
  --    change a single number HoneyFarm can see.
  UPDATE current_inventory ci
  SET quantity = t.quantity, total_cost = t.total_cost, avg_price = t.avg_price
  FROM hf_targets t
  WHERE ci.tenant_id = v_tenant_id
    AND ci.item_type = t.item_type
    AND ci.location_id IS NOT DISTINCT FROM t.location_id;

  -- 4. Prove it: every balance identical to where it started.
  SELECT COUNT(*) INTO v_bad
  FROM current_inventory ci
  JOIN hf_targets t
    ON t.item_type = ci.item_type AND t.location_id IS NOT DISTINCT FROM ci.location_id
  WHERE ci.tenant_id = v_tenant_id
    AND (ABS(COALESCE(ci.quantity,0) - t.quantity) > 0.001
         OR ABS(COALESCE(ci.total_cost,0) - t.total_cost) > 0.01);

  IF v_bad > 0 THEN
    RAISE EXCEPTION '104: % balance(s) moved during the resync — rolling back.', v_bad;
  END IF;

  RAISE NOTICE '104: archived % row(s), deleted %, wrote % opening balance(s). Balances unchanged.',
    v_archived, v_deleted, v_opened;
END $$;
