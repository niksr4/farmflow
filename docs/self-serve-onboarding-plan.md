# Self-Serve Onboarding Plan

## Goal

Let a new user anywhere in the world:

1. Sign up with email
2. Verify ownership of that email
3. Get a tenant provisioned automatically
4. Log in immediately
5. Finish a guided first-run setup

This plan also covers:

- language selection
- landing-page conversion improvements
- the operational controls needed so self-serve signups do not create junk tenants

## Current State

The product is operational, but onboarding is still admin-led:

- [app/signup/page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/signup/page.tsx) is a request-access form, not a real signup flow.
- [app/api/register-interest/route.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/api/register-interest/route.ts) captures leads and sends notifications, but does not provision tenants or users.
- [app/api/admin/tenants/route.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/api/admin/tenants/route.ts) creates a tenant and default module rows.
- [app/api/admin/users/route.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/api/admin/users/route.ts) separately creates the first user.
- [app/api/locations/route.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/api/locations/route.ts) separately creates locations.
- [components/login-page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/components/login-page.tsx) is still username/password first.
- [app/layout.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/layout.tsx) hardcodes `lang="en"`.
- [components/landing-page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/components/landing-page.tsx) already has imagery, but it is still mostly text, cards, and metrics rather than strong product proof.

## Recommended Product Flow

The best model is not "create a tenant the moment an email is typed".

That creates spam tenants, abandoned tenants, and cleanup work. The better flow is:

1. User submits `name`, `email`, `password`, `estate name`, and optional `country`.
2. App creates a `pending signup`.
3. App sends a verification link or OTP.
4. User verifies email.
5. App provisions the tenant, owner user, defaults, and starter onboarding state.
6. User logs in and completes a first-run wizard.
7. App drops the user into a usable dashboard with guidance instead of an empty workspace.

For this repo, the simplest MVP is:

- email + password signup
- verification email
- standard credentials login afterward

That is a better fit than introducing magic-link-only auth immediately because the current auth path in [lib/auth.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/lib/auth.ts) is already built around credentials.

## Phase 1: Signup And Verification Foundation

### Outcome

Users can create an account request, verify their email, and trigger safe tenant provisioning.

### Schema Changes

Create migrations along these lines:

1. `scripts/61-signup-requests.sql`
   Add `signup_requests` with:
   - `id`
   - `name`
   - `email`
   - `normalized_email`
   - `estate_name`
   - `country`
   - `preferred_locale`
   - `password_hash`
   - `status` (`pending`, `verified`, `provisioned`, `expired`, `cancelled`)
   - `created_at`
   - `verified_at`
   - `provisioned_at`
   - `provisioning_error`

2. `scripts/62-signup-tokens.sql`
   Add `signup_tokens` with:
   - `id`
   - `signup_request_id`
   - `token_hash`
   - `purpose` (`verify_email`)
   - `expires_at`
   - `consumed_at`
   - `created_at`

3. `scripts/63-user-email-auth.sql`
   Extend `users` with:
   - `email`
   - `normalized_email`
   - `email_verified_at`
   - `preferred_locale`

Keep `username` in place during migration. Do not rip it out yet.

### Backend Work

Add a dedicated onboarding/provisioning layer instead of reusing admin routes directly:

- `lib/server/onboarding/signup.ts`
- `lib/server/onboarding/provision-tenant.ts`
- `lib/server/onboarding/tokens.ts`
- `lib/server/onboarding/email.ts`
- `lib/server/onboarding/types.ts`

These helpers should own:

- signup normalization
- duplicate-email checks
- token creation and verification
- idempotent tenant provisioning
- email sending

### API Routes

Add:

- `POST /api/auth/signup`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`

Keep [app/api/register-interest/route.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/api/register-interest/route.ts) only as a sales/contact path, not the primary onboarding path.

### UI Work

Update or add:

- [app/signup/page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/signup/page.tsx)
- `app/verify-email/page.tsx`
- `app/verify-email/confirmed/page.tsx`
- [components/login-page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/components/login-page.tsx)

### Important Logic

- Do not provision the tenant until email verification succeeds.
- Token verification must be idempotent.
- Re-clicking a verification link must not create duplicate tenants.
- Rate-limit signup and resend endpoints.
- Reject disposable or obviously malformed email addresses if possible.

### Acceptance Criteria

- A verified email provisions exactly one tenant.
- Unverified users cannot log in.
- Expired links can be resent.
- Retry on verification does not duplicate users or tenants.

## Phase 2: Tenant Provisioning And First-Run Wizard

### Outcome

A newly verified user gets a usable tenant without owner intervention.

### Provisioning Rules

On successful verification:

1. Create tenant
2. Insert default tenant module rows using the existing module defaults in [lib/modules.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/lib/modules.ts)
3. Create the first owner/admin user
4. Create starter tenant settings using the default behavior already returned by [app/api/tenant-settings/route.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/api/tenant-settings/route.ts)
5. Create one starter location if the user does not define one during the first-run wizard
6. Create an onboarding-state row or onboarding-state JSON payload

### New Schema

Create:

1. `scripts/64-tenant-onboarding-state.sql`
   Add either:
   - `tenant_onboarding` table

   Or:
   - `tenants.onboarding_state` JSONB

Recommended fields:

- `welcome_complete`
- `locations_complete`
- `settings_complete`
- `modules_confirmed`
- `sample_data_loaded`
- `last_step`

### UI Work

Add:

- `app/onboarding/page.tsx`
- `components/onboarding/` folder for step components

Wizard steps should be:

1. Confirm estate name
2. Add first location
3. Confirm bag weight
4. Choose preferred language
5. Confirm module bundle

### Route Work

Add:

- `GET /api/onboarding`
- `PUT /api/onboarding`
- optional `POST /api/onboarding/complete`

Reuse existing APIs where possible:

- [app/api/locations/route.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/api/locations/route.ts)
- [app/api/tenant-settings/route.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/api/tenant-settings/route.ts)

### Acceptance Criteria

- New tenant is usable without owner intervention.
- User can skip non-critical setup and still reach the app.
- A tenant without manual setup still gets one valid starter location.

## Phase 3: Email-First Authentication Rollout

### Outcome

Users can log in with email, while existing username-based estates keep working during migration.

### Backend Changes

Update [lib/auth.ts](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/lib/auth.ts) so login accepts:

- email
- username

Resolution rules:

- if input matches an email shape, authenticate by normalized email
- otherwise continue username logic

### UI Changes

Update [components/login-page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/components/login-page.tsx):

- change label from `Username` to `Email or Username`
- improve copy for first-time self-serve users

### Migration Strategy

- Existing tenants keep their usernames.
- New self-serve users become email-first immediately.
- Later, existing users can optionally add verified emails.

### Acceptance Criteria

- No login regression for current estates.
- New signups can log in using email.
- Owner/admin-created users can still log in with username until upgraded.

## Phase 4: Language Selector And Localization

### Outcome

People who do not speak English can use the product.

### Recommended Model

Use:

- `user preferred language`
- optional `tenant default language`

Do not rely on tenant-only language. Mixed-language teams are common.

### Schema

Add:

1. `scripts/65-locales.sql`
   Extend:
   - `users.preferred_locale`
   - `tenants.default_locale`

Possible starting locales:

- `en`
- `es`
- `pt`
- `fr`

Choose the first non-English languages based on actual target markets.

### Frontend Foundation

Add:

- `lib/i18n/` for dictionaries
- `lib/i18n/dictionaries/en.ts`
- `lib/i18n/dictionaries/<locale>.ts`
- `lib/i18n/get-dictionary.ts`
- `hooks/use-locale.ts` or a small locale context

Update:

- [app/layout.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/layout.tsx)
- [hooks/use-tenant-settings.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/hooks/use-tenant-settings.tsx)
- [components/tenant-settings-page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/components/tenant-settings-page.tsx)

### Rollout Order

Translate these first:

1. landing page
2. signup
3. login
4. settings
5. top navigation
6. dashboard headings and empty states

Translate deeper operational forms after the foundation is stable.

### Important Logic

- Locale must affect labels, buttons, headings, dates, and formatted numbers.
- Do not ship machine-translated UI strings as the primary product strategy.
- Use proper dictionaries so operational terms stay correct.

### Acceptance Criteria

- User can switch language in settings.
- Selected language persists across reloads and sessions.
- `html lang` changes from the current hardcoded English value.

## Phase 5: Landing Page Conversion Upgrade

### Outcome

The landing page feels product-led and globally credible instead of mostly copy-led.

### Current Limitation

[components/landing-page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/components/landing-page.tsx) already has cards, metrics, journey images, and value sections, but it still leans too hard on explanatory copy.

### Recommended Changes

Refactor [components/landing-page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/components/landing-page.tsx) into clearer visual proof sections:

1. Hero with product screenshots or device mockups
2. One operational flow strip:
   `Harvest -> Processing -> Dispatch -> Sales -> Accounts`
3. Mini proof charts:
   - stock accuracy trend
   - dispatch confirmation lag
   - revenue visibility
4. Before-and-after reconciliation panel
5. Localized CTA and signup entry point

### Asset Work

Add new assets under:

- `public/images/landing/`

Prefer:

- real app screenshots
- phone and tablet mockups
- workflow visuals

Do not rely only on decorative graphs.

### Related Page

Update [app/signup/page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/signup/page.tsx) so the CTA on landing moves directly into self-serve signup rather than request access.

### Acceptance Criteria

- The page shows the product clearly in action.
- The primary CTA leads to real signup.
- The page remains mobile-strong and not noisy.

## Phase 6: Admin And Support Controls

### Outcome

Owners can review and recover onboarding problems without manual database work.

### Admin Surface

Extend the current lead/admin surface:

- [app/admin/register-interest/page.tsx](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/app/admin/register-interest/page.tsx)

Or add:

- `app/admin/onboarding/page.tsx`

Functions:

- view pending signups
- see verification status
- see provisioning failures
- retry provisioning
- disable abusive signups

### Acceptance Criteria

- Owner can see why a signup failed.
- Provisioning retries do not duplicate tenants.

## Testing Plan

### Unit Tests

Add tests for:

- signup normalization
- token expiry
- token replay
- idempotent provisioning
- locale fallback rules

### Integration Tests

Add route tests for:

- `POST /api/auth/signup`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`

### End-To-End Tests

Add Playwright coverage for:

1. signup
2. email verification callback
3. first login
4. first-run wizard completion
5. language change persistence

## Recommended Build Order

Build in this exact order:

1. schema for signup and email identity
2. backend signup + verification + provisioning service
3. signup and verification UI
4. onboarding wizard
5. email-first login
6. language foundation
7. landing page redesign
8. admin support tools

## Main Risks

1. Current auth is username-first, so email rollout must be backward compatible.
2. Global unique email rules may later conflict with multi-tenant membership if one person manages more than one estate.
3. Email deliverability and resend reliability matter more once signup becomes self-serve.
4. Translation quality for operational terms must be curated, not guessed.
5. Provisioning must be idempotent or duplicate tenants will appear under retry conditions.

## Recommendation

The best next implementation slice is:

1. email identity schema
2. pending signup flow
3. verification email
4. idempotent tenant provisioning
5. first-run onboarding

That gets the product from admin-led onboarding to real self-serve onboarding without forcing a full auth rewrite at the start.
