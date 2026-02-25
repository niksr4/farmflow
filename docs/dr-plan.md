# Backup & Disaster Recovery Plan

## Targets
- RPO (Recovery Point Objective): 24 hours.
- RTO (Recovery Time Objective): 8 hours.

## Backup Strategy
- Database snapshots via Neon (daily).
- Export critical tenant data on demand via data export endpoints.

## Restore Test Procedure (Quarterly)
1. Clone the production Neon branch to a staging branch.
2. Restore latest snapshot to staging.
3. Run smoke/regression tests:
   - `pnpm test:e2e` (auth login, dashboard drilldowns, owner system health)
   - `pnpm test` (core math/permissions/unit coverage)
   - `pnpm lint`
4. Document results and update RPO/RTO if needed.

## Ownership
- Incident Commander: CTO / Owner.
- Backup Operator: Engineering.
