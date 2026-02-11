# DPDP Operations Notes

## Required DB Migration
Run these on the tenant database before using privacy/security APIs:
- `scripts/40-dpdp-privacy.sql`
- `scripts/41-security-events.sql`
- `scripts/42-billing.sql`
- `scripts/43-mfa.sql`
- `scripts/44-db-roles.sql` (optional, recommended)
- `scripts/22-enable-rls.sql` (if not already applied)

## Retention Defaults (Override with Env Vars)
- `PRIVACY_RETENTION_AUDIT_DAYS` (default 730)
- `PRIVACY_RETENTION_REQUEST_DAYS` (default 365)
- `PRIVACY_DELETION_GRACE_DAYS` (default 30)
- `SECURITY_EVENT_RETENTION_DAYS` (default 365, min 180)

## Scheduled Retention Cleanup
Call `POST /api/cron/retention` daily. If `CRON_SECRET` is set, include:
```
Authorization: Bearer <CRON_SECRET>
```

## Time Sync
- Ensure hosts and runners use NTP and UTC.
- DB session timezone is forced to UTC in `runTenantQuery` for consistent timestamps.

## Data Rights Endpoints
- `GET /api/privacy/notice-status`
- `POST /api/privacy/accept`
- `POST /api/privacy/consent`
- `GET /api/privacy/export`
- `POST /api/privacy/correct`
- `POST /api/privacy/delete`
- `GET /api/privacy/impact?start=...&end=...`
