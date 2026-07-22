# FarmFlow — Claude Code Project Guide

## Project Overview

FarmFlow is a multi-tenant farm management SaaS for coffee/pepper/rubber estates.
Live production URL: **thefarmflow.in**
Primary market: India (INR billing via Razorpay planned)

**Tech stack:**
- Next.js (App Router) + TypeScript
- Neon (serverless Postgres) via `@neondatabase/serverless`
- Deployed on Vercel
- PostHog (EU) for analytics, routed via `/ingest/` rewrites
- Sentry for error tracking
- pnpm 10 workspace
- Vitest for unit tests; Playwright for e2e
- GitHub Actions CI runs on every push to main (lint → unit tests → build → public e2e)

---

## Architecture

### Multi-Tenancy
- Every table has a `tenant_id` column. RLS enforces isolation at the DB level.
- `lib/server/tenant-db.ts` — wraps all DB calls with tenant context
- `lib/server/db.ts` — Neon connection; uses `DATABASE_URL_DEV` in non-prod, `DATABASE_URL` in prod
- Tenant schema bootstrapped by `scripts/20-tenant-schema.sql` and subsequent migrations

### Auth
- Credentials-based (username + password). `lib/auth.ts` (client), `lib/server/auth.ts` (server)
- Sessions are always 30 days (`sessionMode: "app"`) — no short web sessions
- Email verification via one-time tokens (signup flow)
- MFA supported (`scripts/43-mfa.sql`, `lib/server/mfa.ts`)
- Roles: `owner`, `manager`, `user` — owner bypasses all module checks

### Bootstrap
- `app/api/dashboard/bootstrap` — single endpoint the UI calls on load; blends plan, modules, commercial access, guided setup state into one response
- Never trust the browser for access state — the bootstrap response is the source of truth

---

## Module System

Defined in `lib/modules.ts` and `lib/module-access.ts`.

**27 modules** across three plan tiers:

| Plan | Modules |
|------|---------|
| basic | inventory, transactions, accounts, balance-sheet, rainfall, weather, news, resources |
| core | everything in basic + processing, dispatch, sales, other-sales, labor, picking, season, journal, pepper, rubber, ai-analysis |
| enterprise | everything (adds quality, curing, receivables, billing, documents, compliance, market-pricing, plant-health) |

**Key rules:**
- Module IDs are strings (not enums) — extensible without migrations
- Plan IDs: `basic | core | enterprise`
- Plans are a ceiling — owners can override individual modules via the admin console
- `balance-sheet` always blocked for `role=user` system-wide
- Hierarchical resolution: plan → tenant overrides (`tenant_modules`) → per-user exceptions (`user_modules`)
- `defaultEnabled: true` modules activate automatically for new tenants within their plan
- AI assistant (`/api/ai-assistant`) is open to all authenticated users regardless of modules

---

## Commercial Access (`lib/commercial-access.ts`)

Resolves tenant billing stage: `trial | paid | grace | inactive`

- Source table: `tenant_commercial_access` (migration `scripts/74-tenant-commercial-access.sql`)
- Missing billing record → resolves as `manual` legacy (always active) — safe for existing tenants
- New signups get 30-day trial via `provisionSignupRequestById()`
- Providers supported: `none | manual | razorpay | stripe | paddle | lemonsqueezy`

---

## Self-Serve Onboarding (LIVE)

Flow: signup → email verify → auto-provision tenant + 30-day trial → guided setup → dashboard

Key files:
- `app/signup/` — public signup page
- `app/verify-email/` — email verification
- `app/api/onboarding/` — provisioning API
- `lib/server/onboarding/provision-tenant.ts` — creates tenant, modules, location, **seeds 80 default activity codes**
- `components/welcome-onboarding-page.tsx`, `components/onboarding-checklist.tsx`

**Onboarding checklist steps** (in order):
1. Add estate manager (creates a second user account)
2. Add estate locations (if processing/dispatch/sales enabled)
3. Set up activity codes (auto-completed — 80 codes pre-seeded)
4. Add first inventory item
5. Log first labor deployment

**Owner alert:** owner gets an email the moment a new tenant self-provisions.
`/signup` is a live public URL — anyone can self-register.

---

## Activity Codes (80 default codes)

- On every new tenant provisioning, `ensureDefaultActivityCodes()` seeds 80 codes from HoneyFarm/Seshagiri estate structure
- Codes are pre-seeded for any existing tenant with 0 codes via `scripts/87-default-activity-codes.sql`
- Constraint changed from global unique `(code)` to per-tenant `(tenant_id, code)` in script 87
- Users can edit, add, or delete codes at any time

---

## Razorpay Billing (BUILT — NOT ENFORCED)

**Status: intentionally not enforcing yet.** Targeting 3–5 customers for product validation before automating revenue.

Billing code is committed and deployed; it's just not wired into an enforcement path yet:
- `lib/server/billing/razorpay.ts` + `checkout/`, `invoices/`, `subscription/`, `webhooks/`
- `app/api/billing/checkout/`, `app/api/billing/subscription/`, `app/api/billing/webhooks/`
- `lib/commercial-access.ts` — canonical resolver (trial/paid/grace/inactive)
- `lib/server/tenant-commercial-access.ts` — DB layer; `initializeTenantTrialAccess()` now runs
  on every self-serve signup (`lib/server/onboarding/provision-tenant.ts`), so `tenant_commercial_access`
  has accurate trial data ready for whenever enforcement is turned on
- `scripts/74-tenant-commercial-access.sql` — already applied

**Remaining billing work when ready:**
1. Set Razorpay env vars in production
2. Access gate at bootstrap (expired trial → checkout redirect) — read `resolveTenantCommercialAccess`
   in `app/api/dashboard/bootstrap/route.ts` instead of the hardcoded `trialDaysRemaining = null`
3. Trial countdown banner in dashboard — `TrialBanner` component already exists
   (`components/inventory-system/trial-banner.tsx`) but bootstrap doesn't feed it real data yet

---

## Coffee Price Advisor

- `lib/server/coffee-prices.ts` — fetches ICO benchmark prices from Alpha Vantage COFFEE commodity endpoint
- Prices cached 22 hours in `api_response_cache` table so one API call serves all tenants per day
- `estimateSellableStock()` — queries `dry_parch + dry_cherry` from processing records minus sales kg for the fiscal year
- `buildMarketTimingSection()` — formats market context for the weekly digest prompt
- Weekly digest gains a "Market Timing" section: current price, 3-month signal, estimated unsold stock
- Requires: `ALPHAVANTAGE_API_KEY` env var (free tier, 25 calls/day sufficient)

---

## Key Library Files

| File | Purpose |
|------|---------|
| `lib/modules.ts` | Plan/module definitions and bundles |
| `lib/module-access.ts` | Server-only module access checks (DB-backed, cached) |
| `lib/server/module-access.ts` | Re-exports `lib/module-access.ts` |
| `lib/commercial-access.ts` | Resolve billing stage from raw DB row |
| `lib/server/tenant-commercial-access.ts` | Fetch + upsert commercial access (DB layer) |
| `lib/permissions.ts` | Role-based permission checks |
| `lib/roles.ts` | Role definitions |
| `lib/tenant.ts` | Tenant resolution helpers |
| `lib/tenant-guidance.ts` | Context-aware hints for workspace |
| `lib/server/coffee-prices.ts` | Coffee price advisor — Alpha Vantage fetch + analysis |
| `lib/server/billing/razorpay.ts` | Razorpay API wrapper (undeployed) |
| `lib/server/onboarding/provision-tenant.ts` | Tenant provisioning + activity code seeding |
| `lib/server/auth.ts` | Server-side auth helpers |
| `lib/server/db.ts` | Neon DB connection |
| `lib/server/audit-log.ts` | Audit trail writes |
| `lib/server/response-cache.ts` | `withResponseCache` — DB-backed API response cache |
| `lib/workspace-hero-content.ts` | `buildHeroContent()` — per-tab hero section data |
| `lib/account-activity-suggestions.ts` | 80 default activity codes + PDF/CSV export |

---

## Admin Console

Comprehensive. Covers:
- Tenant management
- User access and role management
- Module overrides (per-tenant and per-user)
- Audit logs
- Commercial access control

Route: `app/admin/`

---

## Component Architecture

`components/inventory-system.tsx` is the main dashboard shell (~8,300 lines — ongoing decomposition).

Extracted components so far:
- `components/inventory-system/` — types, constants, utils, onboarding, data-tools-export
- `lib/workspace-hero-content.ts` — `buildHeroContent()` utility
- `components/inventory-dialogs.tsx` — 4 inventory dialogs (NewItem, EditTransaction, InventoryEdit, DeleteConfirm)
- `components/morning-brief-card.tsx` — AI insights morning brief
- `components/workspace-launcher.tsx` — workspace nav launcher tab
- `components/feedback-widget.tsx` — floating feedback/support widget
- `components/floating-ai-assistant.tsx` — floating AI chat assistant

Decomposition target: keep all files under 1000 lines.

---

## Testing

```bash
pnpm test                    # Vitest unit tests
pnpm test:e2e                # All Playwright e2e
pnpm test:e2e:onboarding     # Self-serve onboarding flow
pnpm test:e2e:auth           # Auth flows
pnpm test:e2e:mobile         # Mobile PWA smoke
pnpm test:regression         # Dashboard regression
```

E2e test files in `tests/e2e/`. Key helpers in `tests/e2e/helpers.ts`.

CI runs automatically on every push to main via `.github/workflows/ci.yml`.

---

## Database Migrations

Sequential SQL files in `scripts/`. Highest numbered = latest schema state.
As of 2026-07-22: up to `101-password-reset-tokens.sql`, both dev and prod fully migrated.

Apply with the migration runner (preferred): `pnpm migrate` (dev) / `pnpm migrate:prod`.
It records applied files in `schema_migrations`, is dollar-quote-aware (handles `DO $$ … $$`
blocks), sorts/compares migration numbers numerically (not lexicographically — a 2026-07-22
bug had 3-digit files like `100-*`/`101-*` silently bootstrapped as "already applied" without
ever running, because `"100-..." < "87-..."` as strings), and rejects new duplicate migration
numbers. Files may still be applied via psql. No ORM — raw SQL only. Both prod (`DATABASE_URL`)
and dev (`DATABASE_URL_DEV`) Neon instances must be migrated separately — prod's `DATABASE_URL`
lives in `.env.vercel.production`, not `.env.local` (`migrate.mjs` only auto-loads `.env`/
`.env.local`, so prod runs need `DATABASE_URL` exported into the shell first).

Migration 90 (`90-honeyfarm-activity-code-cleanup.sql`) is intentionally recorded as applied
on prod **without** its DELETE having run — those "unused" codes are genuinely in use in real
HoneyFarm data, so the DELETE correctly fails its FK constraint there. See the note at the
bottom of that file. Don't try to force it through.

### Tenant isolation (RLS)

- `scripts/98-enable-rls-all-tenant-tables.sql` enables + forces RLS on **every** table with a
  `tenant_id` column (discovers them by column, so new tenant tables are covered automatically).
- `pnpm schema:rls` / `schema:rls:prod` — fails if any `tenant_id` table lacks RLS.
- `pnpm schema:isolation` / `schema:isolation:prod` — proves a non-bypass role cannot read
  another tenant's rows.
- **Status: fully active in both dev and prod (as of 2026-07-21).** The `app_runtime` role
  (non-bypass, DML-only, no DDL) exists on both Neon instances. `pnpm schema:rls[:prod]` and
  `pnpm schema:isolation[:prod]` both pass. `APP_DATABASE_URL` is set in `.env.local` (dev) and
  as a Production env var in Vercel (prod) — confirmed live by observing real `app_runtime`
  connections in `pg_stat_activity` after a production redeploy, with zero runtime errors
  since. Tenant isolation is now DB-enforced, not just query-discipline-enforced. `lib/server/db.ts`
  exposes `sql` (runtime, uses `APP_DATABASE_URL`) and `adminSql` (owner, for DDL/self-healing —
  always `DATABASE_URL`, unaffected). Roll back instantly by unsetting `APP_DATABASE_URL`
  wherever it's set — the app falls back to the owner connection (RLS-bypassing, isolation via
  query filters only, same as before this was activated).

---

## Cron Jobs

- Vercel cron: `GET /api/cron/orchestrator` runs daily at 02:00 UTC
- Weekly digest agent runs Monday mornings; includes market timing section when `ALPHAVANTAGE_API_KEY` is set

---

## Deployment

Deployed on Vercel. Config in `vercel.json`.

Key env vars:
- `DATABASE_URL` — prod Neon connection
- `DATABASE_URL_DEV` — dev Neon connection (used in non-production)
- `APP_DATABASE_URL` — least-privilege `app_runtime` role connection (RLS-enforced); falls back to
  `DATABASE_URL`/`DATABASE_URL_DEV` when unset
- `ANTHROPIC_API_KEY` — Claude API (AI assistant, weekly digest, AI analysis). Background agents
  (digest, log-anomaly, etc.) also support an undocumented-until-now fallback chain to
  `OPENAI_API_KEY`/`AGENT_OPENAI_MODEL` then `GROQ_API_KEY`/`AGENT_GROQ_MODEL` — see
  `lib/server/agents/ai-model.ts`
- `ALPHAVANTAGE_API_KEY` — coffee price data (weekly digest market timing)
- `WEATHERAPI_API_KEY` — weather forecast in weekly digest
- `THENEWSAPI_API_KEY` — coffee market news tab
- `RESEND_API_KEY` — transactional email (digest, onboarding, alerts)
- `CRON_SECRET` — gates all `/api/cron/*` routes; fails closed (503) when unset
- `APP_DATA_ENCRYPTION_KEY` — field-level encryption key (`lib/field-encryption.ts`). Falls back to
  `NEXTAUTH_SECRET` if unset, which couples encrypted-field decryption to auth session rotation —
  set this explicitly to decouple them (logs a warning when the fallback is used)
- `PLANTHEALTH_API_KEY` (+ `PLANTHEALTH_API_URL` or `KINDWISE_HEALTH_API_URL` to override the
  endpoint) — plant health assessment. A legacy lowercase `planthealth` fallback still exists in
  `app/api/plant-health/route.ts`; confirm nothing in prod relies on it before deleting
- `AUTH_APP_SESSION_MAX_AGE_SECONDS` / `AUTH_WEB_SESSION_MAX_AGE_SECONDS` — override the 30-day
  session default (see "Sessions always 30 days" below) if ever needed; unset in normal operation
- Razorpay vars (when billing is activated): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`, plan IDs via `RAZORPAY_PLAN_{PLAN}_{CYCLE}_ID` (e.g.
  `RAZORPAY_PLAN_CORE_MONTHLY_ID`) — see `lib/server/billing/razorpay.ts`

### Release process

**Current state:** every push to `main` auto-deploys straight to production — no staging environment,
no manual promotion gate. The only check is CI (lint → typecheck → unit tests → build → public e2e).
This is fine for pre-revenue validation but has zero buffer between "pushed" and "live for every tenant."

**A structural git-level gate (stop `main` pushes from auto-shipping) is NOT available on this
project's plan.** Investigated 2026-07-21:
- Vercel's clean mechanism for this, `deploymentPolicy` (per-branch production gating via the
  Project API), is **Pro/Enterprise only** — confirmed by a clean `pro_plan_required` rejection on
  this Hobby-tier project.
- The older per-domain `gitBranch` binding looked like a workaround (point the live domain at a
  branch other than the configured Production Branch) but **caused a real, if brief, live outage**
  when tried: any branch other than the one branch designated Production gets classified
  **Preview-tier** by Vercel, and Preview deployments sit behind Vercel's own SSO/login wall on this
  project — so real visitors to thefarmflow.in got redirected to a Vercel login page instead of the
  app. Reverting the domain's `gitBranch` setting did **not** auto-restore service; recovery required
  explicitly re-aliasing the domain to the last known-good deployment
  (`vercel alias set <deployment-id> www.thefarmflow.in`). **Do not attempt the domain-`gitBranch`
  approach again** — it's a live-outage risk on this plan tier, not a viable gate.

**What actually works — the CLI staged-deploy workflow**, which correctly builds with Production-tier
classification (no SSO wall) from the start:

1. `vercel --prod --skip-domain` — builds a real production deployment (production env vars, prod
   behavior, public URL, no protection wall) but does **not** point thefarmflow.in at it. Safe to
   build and poke at without any customer seeing it.
2. Verify it: `vercel inspect <deployment-url>`, `vercel logs --deployment <deployment-url> --level error`,
   or click around the unique URL it gets — it's genuinely public, no login wall.
3. `vercel alias set <deployment-id> www.thefarmflow.in` (or `vercel promote <deployment-url-or-id>`)
   — this is the moment it actually goes live.

Rollback: `vercel alias set <previous-known-good-deployment-id> www.thefarmflow.in`, or
`vercel rollback`.

This needs zero dashboard/plan changes and works today via the authenticated CLI (`Vercel_token` in
`.env.local`, passed as `--token`; see `reference_vercel_cli_token` memory). The auto-deploy-per-push
behavior on `main` keeps working exactly as before for anyone who pushes without using this flow —
so the actual discipline is: **stop pushing straight to `main` for anything you want gated, build and
alias deliberately instead using the sequence above.**

---

## Strategic Decisions (Do Not Second-Guess Without Asking)

- **Billing enforcement deferred** — validating product with real customers first; manual billing is acceptable
- **Razorpay first** — India-first, INR-native; Stripe is for later when global traction exists
- **Module IDs are strings** — deliberate, avoids enum migration churn
- **Owner bypasses modules** — by design, owner should never be locked out
- **Missing commercial record = legacy/always-active** — safe rollout path for existing tenants
- **AI assistant open to all users** — it's a help/navigation tool, not a premium analytics feature
- **Sessions always 30 days** — estate managers use personal devices; short sessions add friction with no security benefit
- **Activity codes pre-seeded** — 80 codes from HoneyFarm/Seshagiri structure provisioned on signup; removes blank-slate friction
