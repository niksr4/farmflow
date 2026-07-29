-- 103: Remove Laxmi's orphaned "Arabica Cherry" current_inventory row.
--
-- Background: on 2026-05-21 the Laxmi admin added four inventory items in one sitting.
-- Three wrote both halves correctly:
--
--   16:31:44  Robusta parchment bags  -> current_inventory + transaction_history #391 (279 kg)
--   16:32:28  Arabica Parchment       -> current_inventory + transaction_history #392 (19 kg)
--   16:42:39  Robusta cherry          -> current_inventory + transaction_history #393 (130 kg)
--   16:44:02  Arabica Cherry          -> current_inventory ONLY, no ledger row
--
-- The exact mechanism is NOT established. What is known:
--   * transaction_history id 394 exists for no tenant — a sequence gap exactly where the
--     Arabica Cherry row would have landed, consistent with an insert that was lost.
--   * no audit_logs entry records a transaction_history delete for this tenant, ever — but
--     absence there proves little: audit coverage of transaction_history is roughly half
--     (209 rows created since audit logging began vs 101 create events), routes log one event
--     per user action rather than per row, and trigger-driven current_inventory changes are
--     never audited at all. The audit log is not a complete record and must not be read as one.
--   * the row carries quantity 11, but POST /api/inventory-neon creates the slot at quantity 0
--     and lets the AFTER INSERT trigger on transaction_history set the real number — so a
--     simple "ledger insert failed" story does not by itself explain a balance of 11.
-- Do not treat any single cause as proven. Separately and on its own merits, that route did
-- create the slot and insert the opening transaction as two independent writes; it is made
-- atomic in the same commit as this migration, which removes one way this can happen again
-- without claiming it was the way it did happen here.
--
-- The 11 kg is being deleted rather than backfilled: reviewed with the owner, who judged the
-- entry unintended (Laxmi's Arabica harvest does not run in May). Deleting the orphan row also
-- takes the tenant's inventory-vs-ledger drift to zero, so the reconciliation panel reads clean.
-- If it turns out the stock was real, restore it by adding the item again through the UI with a
-- quantity of 11 — do NOT re-insert the row by hand, or it will be orphaned all over again.
--
-- Idempotent, and guarded on the Laxmi tenant id plus a zero-ledger check, so it does nothing
-- on any database where that item has real transaction history (e.g. dev).

DO $$
DECLARE
  v_tenant_id uuid;
  v_ledger_rows int;
  v_deleted int;
BEGIN
  SELECT id INTO v_tenant_id
  FROM tenants
  WHERE LOWER(BTRIM(name)) = 'laxmi'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE '103: no Laxmi tenant on this database — skipping.';
    RETURN;
  END IF;

  -- Only ever remove a genuinely orphaned row. If a ledger entry exists, the balance is
  -- backed by real history and deleting it would destroy data.
  SELECT COUNT(*) INTO v_ledger_rows
  FROM transaction_history
  WHERE tenant_id = v_tenant_id
    AND LOWER(BTRIM(item_type)) = 'arabica cherry';

  IF v_ledger_rows > 0 THEN
    RAISE NOTICE '103: Arabica Cherry has % ledger row(s) — not an orphan, leaving it alone.', v_ledger_rows;
    RETURN;
  END IF;

  DELETE FROM current_inventory
  WHERE tenant_id = v_tenant_id
    AND LOWER(BTRIM(item_type)) = 'arabica cherry';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE '103: removed % orphaned Arabica Cherry inventory row(s).', v_deleted;
END $$;
