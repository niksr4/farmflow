# FarmFlow — Claude Code Project Guide

## Project Overview

FarmFlow is a multi-tenant farm management SaaS for coffee/pepper estates.
Live production URL: **thefarmflow.in**
Primary market: India (INR billing via Razorpay planned)

**Tech stack:**
- Next.js (App Router) + TypeScript
- Neon (serverless Postgres) via `@neondatabase/serverless`
- Deployed on Vercel
- PostHog (EU) for analytics, routed via `/ingest/` rewrites
- Sentry for error tracking
- pnpm workspace
- Vitest for unit tests; Playwright for e2e

---

## Architecture

### Multi-Tenancy
- Every table has a `tenant_id` column. RLS enforces isolation at the DB level.
- `lib/server/tenant-db.ts` — wraps all DB calls with tenant context
- `lib/server/db.ts` — Neon connection; uses `DATABASE_URL_DEV` in non-prod, `DATABASE_URL` in prod
- Tenant schema bootstrapped by `scripts/20-tenant-schema.sql` and subsequent migrations

### Auth
- Credentials-based (username + password). `lib/auth.ts` (client), `lib/server/auth.ts` (server)
- Email verification via one-time tokens (signup flow)
- MFA supported (`scripts/43-mfa.sql`, `lib/server/mfa.ts`)
- Roles: `owner`, `manager`, `user` — owner bypasses all module checks

### Bootstrap
- `app/api/dashboard/bootstrap` — single endpoint the UI calls on load; blends plan, modules, commercial access, guided setup state into one response
- Never trust the browser for access state — the bootstrap response is the source of truth

---

## Module System

Defined in `lib/modules.ts` and `lib/module-access.ts`.

**24 modules** across three plan tiers:

| Plan | Module count | Key additions |
|------|-------------|---------------|
| basic | 6 | inventory, transactions, accounts, balance-sheet, rainfall, weather |
| core | 15 | + processing, curing, quality, dispatch, sales, other-sales, receivables, labor, picking |
| enterprise | 24 | + all remaining modules |

**Key rules:**
- Module IDs are strings (not enums) — extensible without migrations
- Plan IDs are enums: `basic | core | enterprise`
- Plans are a ceiling, not a hard rule — owners can override individual modules outside their plan via the admin console
- `balance-sheet` module is always blocked for `role=user` system-wide (regardless of plan)
- Hierarchical resolution: plan → tenant overrides (`tenant_modules`) → per-user exceptions (`user_modules`)

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
- `lib/server/onboarding/` — provision-tenant.ts, signup.ts, setup.ts, email.ts, owner-alerts.ts
- `components/welcome-onboarding-page.tsx`, `components/onboarding-checklist.tsx`

**Owner alert:** owner gets an email the moment a new tenant self-provisions.
`/signup` is a live public URL — anyone can self-register.

---

## Razorpay Billing (BUILT LOCALLY — NOT DEPLOYED)

**Status: intentionally not enforcing yet.** Targeting 3–5 customers for product validation before automating revenue.

Files (all untracked / not committed):
- `lib/server/billing/razorpay.ts` + `checkout/`, `invoices/`, `subscription/`, `webhooks/`
- `app/api/billing/checkout/`, `app/api/billing/subscription/`, `app/api/billing/webhooks/`
- `lib/server/tenant-commercial-access.ts`
- `app/legal/billing/` — billing policy page
- `scripts/74-tenant-commercial-access.sql` — already applied
- `scripts/75-product-intelligence-events.sql`

Webhook events handled: `authenticated→trialing`, `active`, `pending→past_due`, `halted→unpaid`, `cancelled`, `completed→expired`

Idempotent: `billing_webhook_events` deduplicates by `(provider, external_event_id)`

Plan IDs from env vars: `RAZORPAY_PLAN_*_MONTHLY_ID`

**Remaining billing work when ready:**
1. Deploy untracked billing code + set Razorpay env vars in production
2. Access gate at bootstrap (expired trial → checkout redirect)
3. Trial countdown banner in dashboard

---

## Product Intelligence (BUILT — NOT DEPLOYED)

- `lib/server/product-intelligence-events.ts`
- `scripts/75-product-intelligence-events.sql`
- `tenant_usage_events` table — tenant-scoped, first-party, no cross-tenant aggregation
- Events: `self_serve_tenant_provisioned`, `guided_setup_completed`, `billing_checkout_created`, `billing_webhook_processed`, `permission_change`

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
| `lib/server/billing/razorpay.ts` | Razorpay API wrapper |
| `lib/server/onboarding/provision-tenant.ts` | Tenant provisioning logic |
| `lib/server/auth.ts` | Server-side auth helpers |
| `lib/server/db.ts` | Neon DB connection |
| `lib/server/audit-log.ts` | Audit trail writes |
| `lib/server/security-events.ts` | Security event logging |
| `lib/server/whatsapp-alerts.ts` | WhatsApp alert dispatch |

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

---

## Database Migrations

Sequential SQL files in `scripts/`. Highest numbered = latest schema state.
As of 2026-04-07: up to `76-expense-inventory-links-table.sql`.

Apply via Neon console or psql. No ORM — raw SQL only.

---

## Cron Jobs

- Vercel cron: `GET /api/cron/orchestrator` runs daily at 02:00 UTC

---

## Deployment

Deployed on Vercel. Config in `vercel.json`.
Env vars needed for billing: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_BASIC_MONTHLY_ID`, `RAZORPAY_PLAN_CORE_MONTHLY_ID`, `RAZORPAY_PLAN_ENTERPRISE_MONTHLY_ID`

---

## Active Branch: `feature/self-serve-onboarding-plan`

Current git status summary:
- Modified (tracked): `app/api/labor-neon/route.ts`, `app/api/privacy/*`, `components/task-guide-card.tsx`, `components/workspace-hints.tsx`, `lib/tenant-guidance.ts`, `package.json`, `playwright.config.ts`, e2e test files
- Untracked (not deployed): all billing files, commercial-access lib, product-intelligence-events, `scripts/74-tenant-commercial-access.sql`, `tests/commercial-access.test.ts`, `tests/razorpay-billing.test.ts`, `tests/e2e/workspace-hints.spec.ts`

---

## Strategic Decisions (Do Not Second-Guess Without Asking)

- **Billing enforcement deferred** — validating product with 3–5 real customers first; manual billing is acceptable
- **Razorpay first** — India-first, INR-native; Stripe is for later when global traction exists
- **Module IDs are strings** — deliberate, avoids enum migration churn
- **Owner bypasses modules** — by design, owner should never be locked out
- **Missing commercial record = legacy/always-active** — safe rollout path for existing tenants
