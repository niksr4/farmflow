# Accounts / Inventory / Expenses wiring audit

Prompted by: whether adding an activity-code field to direct inventory
depletion made sense. Widened to a full trace of how Accounts, Inventory,
Expenses, and Labor actually connect, to judge whether a logic/UX redesign
is warranted before adding anything.

Status: findings only. Nothing fixed yet — see recommendation at the bottom
for suggested order of attack.

## How it's wired today

- **Inventory ledger**: `transaction_history` (append-only) + `current_inventory`
  (materialized balance via the `update_inventory()` trigger). The legacy
  `inventory_transactions` table is dead (zero app references).
- **Accounts/expenses**: `expense_transactions` (UI-labeled "Other Expenses"),
  required `code` column tying to `account_activities`. Optionally links to
  inventory via `expense_inventory_links` for depletion — consumption only,
  never acquisition.
- **Labor**: `labor_transactions`, also `code`-linked, summed into every P&L
  rollup identically to `expense_transactions`.
- **Journal**: `journal_entries` — an agronomy field diary (fertilizer/spray/
  irrigation notes), *not* a financial ledger despite the name. Fully
  independent of the above.
- **Balance sheet**: `app/api/finance-balance-sheet/route.ts` sums
  `labor_transactions.total_cost + expense_transactions.total_amount` as
  booked P&L outflow; `sales_records` (+ `other_sales_records`) as revenue.
  `transaction_history` is deliberately excluded from the total (documented
  double-counting rationale) and shown only as a memo line.

## Bugs (money-correctness, not just UX)

1. **The inventory "usage value" memo line is fake, not just excluded.**
   `transaction_history.total_cost` is written as `0` on every deplete row —
   the direct-deplete panel never collects a price, and the expense-linked
   path hardcodes literal `0, 0` even though the parent expense has a real
   `total_amount` (`app/api/expenses-neon/route.ts:649-650`). Meanwhile
   `current_inventory`'s trigger *does* correctly track weighted-average
   cost — that number just never gets written back to the transaction row.
   Anything reading `transaction_history.total_cost` for a deplete row
   (balance-sheet memo line, recent-activity feed, exports) is silently
   wrong, not conservatively blank.

2. **Two labor-cost pipelines, never reconciled.** `labor_transactions`
   (feeds every accounting rollup) and `worker_ledger` +
   `attendance_records` + `picking_records` (feeds only
   `payroll-summary`/`worker-ledger-tab`) are entirely separate systems with
   no cross-check. A farm could double-count or under-count real labor spend
   across the two with nothing to catch it — unlike the one-time deliberate
   reclassification done between `expense_transactions` and
   `labor_transactions` in `scripts/89`.

3. **Two P&L formulas that can silently drift.** `finance-balance-sheet`
   includes `other_sales_records` and inventory/receivables/billing memo
   lines; `exports/ops`'s monthly P&L export only sums `sales_records` and
   has no inventory/receivables/billing awareness at all. Same core formula,
   hand-maintained twice, no shared source of truth — a customer comparing
   the in-app balance sheet to an exported monthly P&L will see different
   numbers for the same month.

## Structural gap (the actual redesign candidate)

- **Expense→inventory linking is a regex match on free-text `notes`**
  (`[expense_id:N]`), not a real foreign key. Fragile — editing notes or a
  bulk-edit tool touching that field can silently break the link.
- **The link only goes one direction.** Consumption ("this expense used
  stock I already had") is linkable; acquisition ("this expense bought
  stock") is not. Buying fertilizer today is two disconnected manual
  actions — log the expense, separately go to Stock → Restock — with no
  shared ID and explicit UI copy telling the user to do it themselves
  (`other-expenses-tab.tsx:532-538`).
- This is the actual prerequisite for the original "add a code field to
  direct inventory depletion" idea: adding a code column on top of
  `transaction_history` rows that are all `total_cost = 0` wouldn't produce
  real activity-level cost data. Fixing bug #1 has to come first, or the
  new field would just be more zero-cost rows with a code attached.

## Hygiene (low priority, do whenever convenient)

- Confirmed dead tables beyond the already-known `inventory_transactions`:
  `other_expenses` (renamed to `expense_transactions` outside any tracked
  migration), `labor_deployments` (renamed to `labor_transactions`, same
  way), and likely `inventory_summary` (zero app references, only appears in
  the tenant-deletion cleanup list). Same undocumented-rename pattern
  repeats three times now — worth a norm going forward (use `ALTER TABLE
  ... RENAME TO` in a tracked script) rather than a code fix.
- `finance-balance-sheet` fetches `picking_records` revenue every page load
  and never uses the result (`pickingResult`, never destructured) — dead
  query, free removal.

## Recommendation

Fix the money-correctness bugs first, redesign second:

1. Wire real `total_cost` onto deplete-side `transaction_history` rows
   (pull from `current_inventory`'s weighted-average cost on direct
   depletion; propagate the real amount on expense-linked depletion instead
   of the hardcoded `0, 0`). This is what makes bug #1 stop being silently
   wrong, and it's the prerequisite for any activity-code attribution on
   inventory usage to mean anything.
2. Reconcile or explicitly separate the two labor pipelines — at minimum, a
   dashboard/reconciliation check flagging if both are being used for the
   same tenant, similar to what `app/api/reconciliation/route.ts` already
   does for inventory vs. current_inventory drift.
3. Unify the two P&L formulas into one shared function both routes call.
4. Once #1 is fixed: replace the notes-regex link with a real FK column, and
   extend the linking mechanism (or add a symmetric one) to cover
   acquisition, not just consumption — that's the actual UX fix for "buying
   supplies" being two disconnected steps today.
5. Table/query hygiene (dead tables, dead `pickingResult` query) — do
   opportunistically, no urgency.

Full citation-dense trace available in this conversation's Explore agent
output if deeper detail is needed on any specific line.
