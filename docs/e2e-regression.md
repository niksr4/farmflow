# End-to-End Regression Runbook

This suite covers public flows, dashboard drilldowns, and owner-console system-health checks.

## 1) Install browser binaries (first time)

```bash
pnpm exec playwright install chromium
```

## 2) Configure env vars

Required for authenticated suites:

- `E2E_USERNAME` (platform owner or estate test account)
- `E2E_PASSWORD`

Optional:

- `E2E_BASE_URL` (default: `http://127.0.0.1:3000`)
- `E2E_PORT` (default: `3000`)
- `E2E_EXPECT_OWNER` (default: `1`; set to `0` to skip owner-only specs)
- `E2E_SKIP_WEB_SERVER=1` (if app is already running)

## 3) Run suites

```bash
# Public + authenticated + owner checks
pnpm test:e2e

# Full local regression gate
pnpm test:regression
```

## Notes

- If `E2E_USERNAME`/`E2E_PASSWORD` are missing, public specs still run and authenticated specs are skipped.
- High-variance endpoints are mocked inside specs (`/api/intelligence-brief`, `/api/exception-alerts`, `/api/admin/system-health`) to keep drilldown checks deterministic.

