-- 95: Enforce non-negative quantity on current_inventory and transaction_history,
--     and zero out residual negative rows from the Feb 2026 inventory-rename bug.

-- Fix existing negative current_inventory rows (all HoneyFarm, rename-bug artifact).
-- These items have been recoded in transaction_history correctly; the negative balance
-- is an artefact of an old double-counting rename path that was fixed in commit b9ca9b0.
UPDATE current_inventory
  SET quantity = 0, total_cost = 0, avg_price = 0
  WHERE quantity < 0;

-- Guard: prevent future negative quantities from being written to current_inventory.
-- Any write path that would produce a negative balance will now fail at the DB level.
ALTER TABLE current_inventory
  ADD CONSTRAINT check_current_inventory_nonneg_qty CHECK (quantity >= 0);

-- Guard: all individual inventory transactions record an absolute quantity (direction
-- is captured by transaction_type = 'restock' | 'deplete'), so negative values are
-- always a data error.
ALTER TABLE transaction_history
  ADD CONSTRAINT check_transaction_history_nonneg_qty CHECK (quantity >= 0);
