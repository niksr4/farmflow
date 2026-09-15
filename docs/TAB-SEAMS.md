# Where the tabs touch — the seam map

<!-- GENERATED FILE — run `node scripts/dev/tab-seams.mjs` to regenerate. Do not hand-edit. -->

Every tab's components are read for `fetch("/api/…")` calls, every API route is read for the
tables it queries, and the two are joined. Table names are checked against the live schema, so a
SQL keyword or a CTE alias cannot masquerade as a table.

`tenants`, `locations`, `users`, `audit_log`, `tenant_modules` are excluded — everything touches them and their presence in a
list says nothing.

## Why this file exists

**Every expensive bug this project has had lived on a seam, not inside a tab.** Not one of them
was a crash; all of them were a screen confidently reporting a number that another screen, reading
the same rows, would have reported differently:

| What happened | Seam | Cost |
|---|---|---|
| Revaluation counted as trade in 3 of 5 readers of the same table | `transaction_history` | ₹105.78 cr phantom depletion, ₹64.42 cr phantom purchases |
| Retention never applied to estates that mark attendance but allocate no work | `attendance_records` ↔ `labour_assignments` | ₹62,020 not withheld, ₹37,600 of it one worker's |
| Net Payable rendered under the heading "Overtime" | payroll header vs body | the figure an estate counts cash from |
| 28 workers accruing absences after leaving the roster | `attendance_workers` ↔ `attendance_records` | 25 of them on one tenant |
| Same day booked twice, >1.0 day per worker | `labour_assignments` | 135 worker-days nobody worked |

A per-tab reviewer sees one side of each of those and finds nothing wrong, because nothing *is*
wrong on one side. That is the argument for the `seam-auditor`.

## The map

| Table | Tabs | Which |
|---|---|---|
| `dispatch_records` | 7 | Balance Sheet, Costs, Dispatch, Inventory, Rainfall, Sales, Season |
| `account_activities` | 6 | Balance Sheet, Costs, Inventory, Muster, Payroll, Picking |
| `attendance_workers` | 6 | Balance Sheet, Costs, Inventory, Muster, Payroll, Picking |
| `expense_transactions` | 6 | Balance Sheet, Costs, Inventory, Muster, Rainfall, Season |
| `processing_records` | 6 | Balance Sheet, Dispatch, Inventory, Processing, Rainfall, Season |
| `attendance_records` | 5 | Balance Sheet, Inventory, Muster, Payroll, Picking |
| `labour_assignments` | 5 | Balance Sheet, Costs, Muster, Payroll, Picking |
| `labour_cost` | 5 | Balance Sheet, Costs, Inventory, Rainfall, Season |
| `picking_records` | 5 | Balance Sheet, Inventory, Muster, Payroll, Picking |
| `transaction_history` | 5 | Balance Sheet, Costs, Inventory, Rainfall, Season |
| `booked_revenue` | 4 | Balance Sheet, Costs, Inventory, Season |
| `current_inventory` | 4 | Balance Sheet, Costs, Inventory, Rainfall |
| `receivables` | 4 | Balance Sheet, Inventory, Rainfall, Season |
| `sales_records` | 4 | Balance Sheet, Inventory, Rainfall, Sales |
| `biometric_devices` | 3 | Muster, Payroll, Picking |
| `labor_transactions` | 3 | Costs, Inventory, Muster |
| `pepper_records` | 3 | Inventory, Processing, Rainfall |
| `expense_inventory_links` | 2 | Costs, Inventory |
| `other_sales_records` | 2 | Rainfall, Sales |
| `rainfall_daily` | 2 | Costs, Inventory |
| `rainfall_records` | 2 | Inventory, Rainfall |
| `user_modules` | 2 | AI, Inventory |
| `worker_ledger` | 2 | Muster, Payroll |
| `worker_pay_rules` | 2 | Muster, Payroll |

**24 shared business tables** across 34 touched; 66 tables in the schema.

## The seams that carry money

Start here. These are where a disagreement is a rupee figure rather than a cosmetic one:

1. **`transaction_history`** — Inventory, Balance Sheet, Season, Costs, *and* `lib/server/ai-analysis.ts`.
   Revaluation rows are real money and not trade. Three of these got it wrong once already, and
   `ai-analysis` was still wrong on 2026-09-15.
2. **`labour_assignments`** — the same day's work priced five ways. Day fractions totalling >1.0
   live here.
3. **`attendance_records`** — a day marked present with no allocation still earns a wage in
   Payroll; the Muster can be silent about it.
4. **`current_inventory` ↔ `transaction_history`** — the ledger replay must reconcile against the
   balance. Filtering rows out of a balance breaks the reconciliation that proves the balance.
5. **`processing_records` → `dispatch_records` → `sales_records`** — kg in, bags out, kg sold.
   Three tabs, one physical quantity, three chances to disagree.
6. **`booked_revenue` ↔ `sales_records` ↔ `receivables`** — revenue recognised, invoiced,
   collected. Balance Sheet and Season both narrate this.

## Reading this map honestly

A tab appearing beside a table means *some route that tab calls mentions that table* — it does not
mean the tab surfaces a number derived from it. Rainfall appears against several tables because its
route calls a shared summary endpoint, not because rainfall has an opinion about sales. **Confirm
the read path before writing a finding**; the map narrows where to look, it is not evidence.
