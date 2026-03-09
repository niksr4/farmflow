# Tenant Compatibility Hardening

This runbook ensures all tenants behave consistently across mixed schema versions.

## Why

Some tenants may still be on older schema states where:
- `current_inventory` unique indexes are missing (breaks `ON CONFLICT` upserts).
- `processing_records` recompute trigger can recurse and cause `stack depth limit exceeded`.

The app now includes runtime fallback for inventory slot creation, but DB remediation is still recommended.

## Required SQL rollouts

Run these scripts in each environment database:

1. `scripts/39-inventory-location-indexes.sql`
2. `scripts/56-fix-processing-recompute-trigger-recursion.sql`

## Verification checks

Run these checks after rollout:

```sql
-- Inventory unique indexes
SELECT indexname
FROM pg_indexes
WHERE tablename = 'current_inventory'
  AND indexname IN (
    'uq_current_inventory_item_tenant_null_location',
    'uq_current_inventory_item_tenant_location'
  );

-- Processing recompute trigger attached
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'processing_records'::regclass
  AND tgname = 'trg_processing_records_recompute';
```

## API behavior after hardening

- Inventory create (`POST /api/inventory-neon`) works even if unique indexes are missing (fallback path).
- Processing create/delete (`/api/processing-records`) now returns a clear 503 with remediation hint if trigger recursion is detected.
