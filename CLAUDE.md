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
- `lib/server/onboarding/provision-tenant.ts` — creates tenant, modules, location, **seeds 91 default activity codes**
- `components/welcome-onboarding-page.tsx`, `components/onboarding-checklist.tsx`

**Onboarding checklist steps** (in order):
1. Add estate manager (creates a second user account)
2. Add estate locations (if processing/dispatch/sales enabled)
3. Set up activity codes (auto-completed — 91 codes pre-seeded)
4. Add first inventory item
5. Log first labor deployment

**Owner alert:** owner gets an email the moment a new tenant self-provisions.
`/signup` is a live public URL — anyone can self-register.

---

## Activity Codes (91 default codes)

- On every new tenant provisioning, `ensureDefaultActivityCodes()` seeds 91 codes from HoneyFarm/Seshagiri estate structure
- Codes are pre-seeded for any existing tenant with 0 codes via `scripts/87-default-activity-codes.sql`
- Constraint changed from global unique `(code)` to per-tenant `(tenant_id, code)` in script 87
- Users can edit, add, or delete codes at any time

---

## Razorpay Billing (BUILT LOCALLY — NOT DEPLOYED)

**Status: intentionally not enforcing yet.** Targeting 3–5 customers for product validation before automating revenue.

Files (all untracked / not committed):
- `lib/server/billing/razorpay.ts` + `checkout/`, `invoices/`, `subscription/`, `webhooks/`
- `app/api/billing/checkout/`, `app/api/billing/subscription/`, `app/api/billing/webhooks/`
- `lib/server/tenant-commercial-access.ts`
- `scripts/74-tenant-commercial-access.sql` — already applied

**Remaining billing work when ready:**
1. Deploy untracked billing code + set Razorpay env vars in production
2. Access gate at bootstrap (expired trial → checkout redirect)
3. Trial countdown banner in dashboard

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
| `lib/module-access.ts` | Client-side module access checks |
| `lib/server/module-access.ts` | Server-side module access checks |
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
| `lib/server/audit-log.ts` | Audit trail writes |
| `lib/server/response-cache.ts` | `withResponseCache` — DB-backed API response cache |
| `lib/workspace-hero-content.ts` | `buildHeroContent()` — per-tab hero section data |
| `lib/account-activity-suggestions.ts` | 91 default activity codes + PDF/CSV export |

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
As of 2026-05-05: up to `87-default-activity-codes.sql`.

Apply via Neon console or psql. No ORM — raw SQL only.

Both prod (`DATABASE_URL`) and dev (`DATABASE_URL_DEV`) Neon instances must be migrated separately.

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
- `ANTHROPIC_API_KEY` — Claude API (AI assistant, weekly digest, AI analysis)
- `ALPHAVANTAGE_API_KEY` — coffee price data (weekly digest market timing)
- `WEATHERAPI_API_KEY` — weather forecast in weekly digest
- `THENEWSAPI_API_KEY` — coffee market news tab
- `RESEND_API_KEY` — transactional email (digest, onboarding, alerts)
- Razorpay vars (when billing is activated): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, plan IDs

---

## Strategic Decisions (Do Not Second-Guess Without Asking)

- **Billing enforcement deferred** — validating product with real customers first; manual billing is acceptable
- **Razorpay first** — India-first, INR-native; Stripe is for later when global traction exists
- **Module IDs are strings** — deliberate, avoids enum migration churn
- **Owner bypasses modules** — by design, owner should never be locked out
- **Missing commercial record = legacy/always-active** — safe rollout path for existing tenants
- **AI assistant open to all users** — it's a help/navigation tool, not a premium analytics feature
- **Sessions always 30 days** — estate managers use personal devices; short sessions add friction with no security benefit
- **Activity codes pre-seeded** — 91 codes from HoneyFarm/Seshagiri structure provisioned on signup; removes blank-slate friction
