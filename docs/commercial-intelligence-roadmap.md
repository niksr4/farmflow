# Commercial And Intelligence Roadmap

## Goal

Turn self-serve onboarding into a real commercial funnel:

1. a user signs up
2. gets a 30-day free trial
3. chooses a plan
4. can pay, upgrade, downgrade, or expire cleanly
5. uses a product that gets smarter from tenant-safe usage patterns

This document is intentionally practical. It is based on the current repo shape:

- plan entitlements already exist through `tenants.subscription_plan`
- guided setup already asks for a plan bundle
- there is no real subscription checkout, webhook sync, or trial lifecycle yet
- PostHog exists, but first-party tenant intelligence storage is still missing

## Payment Recommendation

For India-first self-serve launch, use **Razorpay Subscriptions** as the primary integration.

Why Razorpay is the best fit for this codebase right now:

- the business is India-based and needs INR-native recurring payments first
- Razorpay Subscriptions supports Cards, UPI Autopay, and Emandate for recurring payments in India
- a hosted subscription link is a faster and safer first integration than embedding billing UI immediately
- the repo already separates plan entitlements from commercial access, so Razorpay webhook sync can become the source of truth later

Use **Stripe Billing** when the commercial center of gravity shifts to global customers and the account is approved for the required billing setup. Use **Paddle** only if the business decides that merchant-of-record handling is more important than direct billing control.

Avoid starting with Lemon Squeezy for this product unless the goal is the fastest possible lightweight launch with less billing flexibility. It is viable, but the app is already growing beyond the “simple SaaS checkout” shape.

## Phase 1: Commercial Data Model

Ship the foundational schema before any provider-specific routes:

- `scripts/74-tenant-commercial-access.sql`
- `lib/commercial-access.ts`
- `lib/server/tenant-commercial-access.ts`

This gives the app one place to answer:

- what plan the tenant is commercially on
- whether the tenant is trialing, active, in grace, or inactive
- which provider owns billing state
- when access should end

Current behavior in this repo stays safe because missing commercial rows should continue to resolve as legacy manual access until billing is fully switched on.

## Phase 2: Provider Integration

Build provider-specific plumbing after the data model lands.

Recommended Razorpay shape:

1. hosted subscription checkout route for plan purchase or upgrade
2. current-subscription route for tenant billing state
3. Razorpay webhook route for subscription lifecycle sync
4. idempotent event persistence in `billing_webhook_events`

The app should never trust the browser as the source of truth for access. The source of truth has to be the synced commercial record after webhook handling.

## Phase 3: Trial Lifecycle

New self-serve tenants should get:

- status `trialing`
- a 30-day `trial_ends_at`
- an access expiry date that matches the trial end unless billing activates first

Desired tenant behavior:

1. trial active: full access to the selected plan
2. trial ending soon: clear upgrade prompts
3. expired trial: read-only dashboard plus billing CTA
4. payment success: move to `active`
5. failed renewal: grace mode before hard lockout

## Phase 4: Access Enforcement

Access enforcement should stay separate from module entitlement logic.

- `tenants.subscription_plan` answers which plan bundle the tenant is on
- commercial access answers whether the tenant should currently be allowed in
- owner overrides remain possible in the owner console

That means the runtime access check should eventually answer two questions:

1. is the tenant commercially active enough to enter the app?
2. which modules should this tenant see once access is granted?

## Phase 5: Product Intelligence Foundation

The platform should get smarter from usage, but not by blindly retraining on tenant data.

Ship first-party event and feedback storage:

- `scripts/75-product-intelligence-events.sql`
- `lib/server/product-intelligence-events.ts`

Track events like:

- tenant provisioned
- guided setup completed
- module opened
- export run
- repeated filter choice
- recommended action accepted or dismissed

This should remain tenant-isolated and explainable.

## Phase 6: Learned Product Behavior

After first-party events exist, add small, useful learning loops:

- remember the tenant’s most-used modules and reorder shortcuts
- suggest the default location, buyer, or ledger based on repeated usage
- flag missing links between dispatch, sales, receivables, and billing
- detect unusual labor, yield, or rainfall patterns
- learn which prompts or recommendations the tenant ignores

For FarmFlow, “smart” should mean operationally useful behavior, not generic chatbot decoration.

## Guardrails

- Do not use cross-tenant raw data as a training corpus for product behavior.
- Keep commercial entitlements deterministic and auditable.
- Store webhook payloads for replay and debugging.
- Keep trial expiry behavior explicit in UI copy and server rules.
- Make recommendations explainable with “why this was suggested.”

## Immediate Next Build Steps

1. Add provider env vars and a provider abstraction with Razorpay first.
2. Build `POST /api/billing/checkout` and `POST /api/billing/webhooks/razorpay`.
3. Add `GET /api/billing/subscription`.
4. Add runtime commercial gating before dashboard bootstrap.
5. Instrument high-value product events beyond onboarding.
