# End-to-End Regression Runbook

This suite covers public flows, dashboard drilldowns, owner-console system-health checks, and tenant-admin auth smoke checks.

## 1) Install browser binaries (first time)

```bash
pnpm exec playwright install chromium
```

## 2) Configure env vars

Required for authenticated suites:

- `E2E_USERNAME` + `E2E_PASSWORD` for standard authenticated dashboard runs.
- `E2E_OWNER_USERNAME` + `E2E_OWNER_PASSWORD` for owner-console runs when `E2E_EXPECT_OWNER=1` (default).
- `E2E_ADMIN_USERNAME` + `E2E_ADMIN_PASSWORD` for tenant-admin smoke runs when `E2E_EXPECT_ADMIN=1`.

Optional:

- `E2E_BASE_URL` (default: `http://127.0.0.1:3000`)
- `E2E_PORT` (default: `3000`)
- `E2E_EXPECT_OWNER` (default: `1`; set to `0` to skip owner-only specs)
- `E2E_EXPECT_ADMIN` (default: `0`; set to `1` to include tenant-admin auth smoke)
- `E2E_SKIP_WEB_SERVER=1` (if app is already running)

## 3) Run suites

```bash
# Public + authenticated + owner checks
pnpm test:e2e

# Authenticated suites only (fails fast if E2E creds are missing)
pnpm test:e2e:auth

# Full local regression gate
pnpm test:regression

# Strict gate for release readiness
pnpm test:regression:strict

# Canonical local strict gate (owner only)
E2E_OWNER_USERNAME="$(grep '^E2E_OWNER_USERNAME=' .env.local | cut -d= -f2-)" \
E2E_OWNER_PASSWORD="$(grep '^E2E_OWNER_PASSWORD=' .env.local | cut -d= -f2-)" \
E2E_EXPECT_OWNER=1 \
E2E_EXPECT_ADMIN=0 \
NEXTAUTH_URL="http://127.0.0.1:3000" \
pnpm test:regression:strict

# Canonical local strict gate (owner + tenant admin)
E2E_OWNER_USERNAME="$(grep '^E2E_OWNER_USERNAME=' .env.local | cut -d= -f2-)" \
E2E_OWNER_PASSWORD="$(grep '^E2E_OWNER_PASSWORD=' .env.local | cut -d= -f2-)" \
E2E_ADMIN_USERNAME="$(grep '^E2E_ADMIN_USERNAME=' .env.local | cut -d= -f2-)" \
E2E_ADMIN_PASSWORD="$(grep '^E2E_ADMIN_PASSWORD=' .env.local | cut -d= -f2-)" \
E2E_EXPECT_OWNER=1 \
E2E_EXPECT_ADMIN=1 \
NEXTAUTH_URL="http://127.0.0.1:3000" \
pnpm test:regression:strict

# Deployed parity check (prod/preview URL)
E2E_OWNER_USERNAME="$(grep '^E2E_OWNER_USERNAME=' .env.local | cut -d= -f2-)" \
E2E_OWNER_PASSWORD="$(grep '^E2E_OWNER_PASSWORD=' .env.local | cut -d= -f2-)" \
E2E_ADMIN_USERNAME="$(grep '^E2E_ADMIN_USERNAME=' .env.local | cut -d= -f2-)" \
E2E_ADMIN_PASSWORD="$(grep '^E2E_ADMIN_PASSWORD=' .env.local | cut -d= -f2-)" \
E2E_EXPECT_OWNER=1 \
E2E_EXPECT_ADMIN=1 \
E2E_BASE_URL="https://farmflowv1.vercel.app" \
E2E_SKIP_WEB_SERVER=1 \
pnpm test:e2e:auth
```

## Notes

- If auth vars are missing, public specs still run and authenticated specs are skipped.
- When `E2E_EXPECT_OWNER=1`, owner vars are required for strict authenticated gates.
- When `E2E_EXPECT_ADMIN=1`, tenant-admin vars are required.
- `pnpm test:e2e:auth` and `pnpm test:regression:strict` intentionally fail fast when required env vars are not set.
- High-variance endpoints are mocked inside specs (`/api/intelligence-brief`, `/api/exception-alerts`, `/api/admin/system-health`) to keep drilldown checks deterministic.
