# Scenario: Processing → Dispatch → Sale

Modules needed: `processing`, `dispatch`, `sales` (plan: `core` or
`enterprise`). Role: `admin`.

This chases a single batch of coffee through three tabs and checks the
quantity never drifts — the kind of bug that doesn't show up testing any one
tab alone.

## Steps

1. Log a processing record producing a known output (e.g. dry parchment, a
   specific kg figure you'll track through the rest of the scenario).
2. Open Dispatch (`components/dispatch-tab.tsx`) and dispatch some, but not
   all, of that processed quantity to a buyer/location.
3. Immediately try to dispatch the *remaining* quantity a second time from a
   second browser tab/session before the first dispatch finishes saving —
   double-dispatch / race condition check. Does it allow dispatching more
   than actually exists?
4. Open Sales (`components/sales-tab.tsx`) and record a sale against the
   dispatched quantity.
5. Try to record a sale for *more* than what was dispatched. Should be
   rejected or flagged — check what actually happens.
6. Edit the original processing record from step 1 (correct the output
   quantity downward, as if the first number was a data-entry mistake made
   under time pressure). Does dispatch/sales still reconcile, or does the
   already-dispatched quantity now exceed what's on record as processed?

## Reconcile

At the end, ask: does `estimateSellableStock()`
(`lib/server/coffee-prices.ts`) — dry_parch + dry_cherry minus sales kg for
the fiscal year — match what you'd compute by hand from the steps above? A
mismatch here means the coffee price advisor's "estimated unsold stock" in
the weekly digest is quietly wrong, not just a UI display issue.
