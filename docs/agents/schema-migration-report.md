# Schema + Migration Assistant Report

- Mode: working-tree
- Risk Level: **MEDIUM**
- Changed SQL files: 5
- Destructive flags: 0
- Warnings: 2
- Idempotency flags: 0
- Generated at: 2026-02-24T14:52:39.581Z

## Changed SQL Files
- `scripts/17-add-owner-role-and-user.sql`
- `scripts/20-tenant-schema.sql`
- `scripts/52-add-viewer-role.sql`
- `scripts/53-processing-recompute-and-composite-indexes.sql`
- `scripts/54-agent-ops.sql`

## Touched Tables
- `account_activities`
- `agent_run_findings`
- `agent_runs`
- `app_error_events`
- `current_inventory`
- `data_integrity_exceptions`
- `dispatch_records`
- `expense_transactions`
- `hf_arabica`
- `hf_pepper`
- `hf_robusta`
- `inventory_summary`
- `labor_transactions`
- `mv_pepper`
- `mv_robusta`
- `pg_pepper`
- `pg_robusta`
- `processing_records`
- `rainfall_records`
- `sales_records`
- `tenant_modules`
- `tenants`
- `transaction_history`
- `user_modules`
- `users`

## Findings
### scripts/17-add-owner-role-and-user.sql
- [MEDIUM] UPDATE without WHERE detected; verify this is intended

### scripts/20-tenant-schema.sql
- [OK] No obvious destructive/idempotency risks detected

### scripts/52-add-viewer-role.sql
- [MEDIUM] File removed or renamed; validate migration ordering and rollback requirements.

### scripts/53-processing-recompute-and-composite-indexes.sql
- [OK] No obvious destructive/idempotency risks detected

### scripts/54-agent-ops.sql
- [OK] No obvious destructive/idempotency risks detected

## Human Approval Checklist
- [ ] Confirm migration is additive and idempotent where possible.
- [ ] Run generated safety checks before and after migration.
- [ ] Review and complete rollback template with tested reverse steps.
- [ ] Verify no unintentional data loss or table lock risk.
- [ ] Execute manually in Neon SQL editor after approval (no auto-run).

## Generated Artifacts
- `scripts/generated/schema-safety-check.sql`
- `scripts/generated/schema-rollback-template.sql`
