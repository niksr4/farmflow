# FarmFlow — Claude Code Project Guide

> **Start with [STATUS.md](STATUS.md)** for where things currently stand — tenant states, what is
> blocked on whom, and decisions already settled. This file is how the system works; that one is
> what is happening. Keep it current when a tenant's state changes.

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

**Onboarding checklist steps** (in order) — `components/inventory-system/onboarding.ts`:
1. **Map your estate** — estates, blocks, and every block's acreage
2. **Name your storehouse**
3. **Opening stock and what it cost**
4. **Workers and their daily rates**
5. **Pin your weather location**
6. **Give your writer a login**

Completion is **all, not any**, wherever the number is a denominator: stock is done when *every*
item is priced, workers when *every* worker has a rate. The old list went green on the first row,
which is how estates finished onboarding with one of forty items priced. Each check is a pure
predicate in that file so it can be tested against a real payload shape — one reading the wrong
field does not throw, it just never goes green, which is invisible until someone says the checklist
is stuck. Activity codes are no longer a step: 80 are pre-seeded.

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
- `lib/server/tenant-commercial-access.ts` — DB layer; `initializeTenantTrialAccess()` runs
  on every self-serve signup (`lib/server/onboarding/provision-tenant.ts`)
- ⚠️ **`scripts/74-tenant-commercial-access.sql` is NOT applied on prod.** Verified 2026-07-28:
  the `tenant_commercial_access` table does not exist there and `74-*` is absent from
  `schema_migrations`. This doc previously claimed it was applied and that trial data was
  "ready for whenever enforcement is turned on" — it is not. There is **no trial data for any
  tenant**, and `initializeTenantTrialAccess()` has had nothing to write to. Apply migration 74
  to prod *before* doing any of the remaining billing work below, or the access gate will
  resolve every tenant as legacy/always-active.

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

`components/inventory-system.tsx` is the main dashboard shell — **5,064 lines** as of 2026-09-18.
This line previously said "~8,300", which was true at some point and then quietly was not; check it
with `wc -l` rather than trusting the number here.

Extracted modules live in `components/inventory-system/` (42 files) and `lib/`. **Read the
directory, not a list in this file** — an inventory of forty-two filenames in a doc is a list that
rots, and the last one did.

**20 files are still over 1000 lines.** To see them, in size order:

```bash
git ls-files '*.ts' '*.tsx' | grep -v ^tests/ | xargs wc -l | sort -rn | head -25
```

### What decomposition has actually cost and returned

Nine passes ran 2026-09-17/18. Worth knowing before starting another:

- **Module preamble is the cheap win.** Types, constants, pure helpers and data sitting *above* the
  component or handler move with zero behaviour risk, and the move can be *proved*: diff the old
  file from its first export against the new one from the same point and it should be byte-identical.
  `app-training-manual.tsx` went 1159 → 303 this way, `expenses-neon/route.ts` 1812 → 1321.
- **Extracting stateful logic barely shrinks the file.** Three passes over `inventory-system.tsx`
  moved 58 lines, because anything extracted has to be bound back under the same names. The win
  there is testability, not size. Getting that file meaningfully smaller needs a provider/children
  split — an architectural change, not a pass.
- **⚠ THE TAX NOBODY BUDGETS FOR: 78 tests read source files by path.** Moving code silently
  decouples them. Five broke across these passes, and *none* was asserting "this file contains X" —
  each was asserting "the implementation does X". Check before moving:

  ```bash
  rg -l '<path/you/are/about/to/move>' tests/
  ```

  `components/attendance-tab.tsx` is pinned by **12** tests. On raw size it looks like a good
  target; on cost it is the worst on the board.
- **Two guards count things in a directory** and will silently measure less if you move code out of
  it: `tests/estate-scope.test.ts` counts joining queries per file, and
  `tests/labour-cost-readers.test.ts` allowlists direct `labor_transactions` readers *by path*.
- **A broken source scan is usually an upgrade opportunity.** Once the moved code is a pure
  function, a scan that was reaching for a behaviour it could not express can simply ask instead —
  see `tests/training-manual-modules.test.ts` and the rainfall-matrix case in
  `tests/rainfall-one-figure-a-day.test.ts`, both converted from grepping source to calling the
  function.

Decomposition target: keep all files under 1000 lines.

---

## Testing

```bash
pnpm test                    # Vitest — two projects: `unit` (node) and `render` (jsdom)
pnpm test:unit               # .test.ts only
pnpm test:render             # .test.tsx only — mounted components
pnpm lint:dead-imports       # imports nothing reads (see below)
pnpm test:e2e                # All Playwright e2e
pnpm test:e2e:onboarding     # Self-serve onboarding flow
pnpm test:e2e:auth           # Auth flows
pnpm test:e2e:mobile         # Mobile PWA smoke
pnpm test:regression         # Dashboard regression
```

E2e test files in `tests/e2e/`. Key helpers in `tests/e2e/helpers.ts`.

### `pnpm lint` and `pnpm typecheck` do NOT catch an unused import

`eslint-config-next` ships no unused-vars rule, no `@typescript-eslint` plugin is installed, and
`tsc --noEmit` says nothing without `--noUnusedLocals`. Turning the check on for the first time
found **78 dead imports across 38 files**, all of which had survived a full green gate.

`scripts/dev/check-dead-imports.mjs` (`pnpm lint:dead-imports`) now runs in CI between typecheck and
the unit tests. It enforces **imports only**; ~29 unused locals and types are counted and printed
but not enforced, because a deliberately-kept const is a judgement call.

It is not a tidiness rule. `components/worker-profiles-tab.tsx` imported `formatLocationLabel` and
never called it, while a test asserted `expect(src).toContain("formatLocationLabel")` — **a guard
against a real bug, passing on the import line alone.** A dead import is a claim about what a file
does, and when something greps for that claim, being wrong is silent.

### Writing a guard that cannot go vacuous

Most of this codebase's tests scan source, because the bugs are wrong answers rather than crashes.
Three failure modes, each of which has actually happened here:

- **Asserting a mention, not a call.** `toContain("helperName")` is satisfied by the import. Strip
  import lines and match `helperName\s*\(`.
- **A hand-kept list of files.** A list of two or three is how the next instance hides. Derive the
  set instead — `tests/pay-records-are-editable.test.ts` finds every field a route declares
  `.nullable()` and checks *that route* does not `COALESCE` it, so a field added tomorrow is covered
  tomorrow. Where an exemption list is unavoidable, add a second test that fails when an entry stops
  being relevant.
- **A regex pinned to names that happen to be in the current code.** A picker scan matched
  `<SelectItem>` and `loc.name`, so it missed `{l.name}` and `<option>{b.name}</option>` — the only
  two real offenders. Key on *shape* (`value={X.id}` labelled `{X.name}`), not on identifiers.

**Tamper-test every new guard**: break the thing it guards and watch it fail. Several of the
above were caught that way and not by review — including one replacement that was *weaker* than the
scan it replaced.

CI runs automatically on every push to main via `.github/workflows/ci.yml`.

---

## Database Migrations

Sequential SQL files in `scripts/`. Highest numbered = latest schema state.
As of 2026-09-18 the highest file is `151-update-inventory-onconflict-partial-index.sql`; prod has
**149** rows in `schema_migrations` and dev has **150**. This line said `130-*` and "as of
2026-08-20" for four weeks after that stopped being true — **count it, do not read it here**:

```bash
ls scripts/*.sql | sed 's#scripts/##' | sort -t- -k1 -n | tail -1   # highest file
```

⚠ **A fresh database does NOT run migrations 1–87.** `migrate.mjs` has
`BOOTSTRAP_CUTOFF = "87-default-activity-codes.sql"`: when `schema_migrations` is *empty*,
everything up to and including 87 is recorded as applied **without being executed**, because those
predate the runner. Consequences worth knowing before reasoning about a new environment:

- Migrations 19, 29, 36 and 84 deliberately `RAISE EXCEPTION` on an unreplaced placeholder
  (`REPLACE_WITH_TENANT_ID`, `REPLACE_WITH_DIGEST_EMAIL`). They are all below the cutoff, so the
  runner never executes them and never trips over them. Raised as a P1 on PR #22 on the reasoning
  that a fresh DB would abort mid-run; it would not, because of the cutoff.
- The one path that *would* trip is a **non-empty** ledger with one of those rows missing — a
  partial restore, or somebody deleting a row by hand.

"Fully migrated" is not quite true and never was: `74-tenant-commercial-access.sql` was never
applied to prod (see the Razorpay Billing section). Verify against `schema_migrations` rather
than trusting this line — and sort numerically when you do, because `"100-…" < "87-…"` as
strings and a plain `ORDER BY version` hides the newest files in the middle of the list.

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

## Dates, clocks and timezones

**The estate's business locale is IST. Every server FarmFlow runs on is UTC.** Nearly every date
bug in this project lives in that gap, and none of them throws.

### An instant and a wall clock are different things

- An **instant** is a moment (`TIMESTAMPTZ`, `toISOString()`). Use it for arithmetic — durations,
  ordering, "is this newer than that". Timezone-independent by construction.
- A **wall clock** is what a person read off a wall (`08:01`, `2026-09-17`). It belongs to a place.
  A punch happened *at the estate*, so it is IST for everyone looking at it, in every country.

**Never derive a wall clock in the browser.** `date-fns format()`, `toLocaleTimeString()` and
`toLocaleDateString()` all use the *viewer's* timezone unless given an explicit one, so the same
record reads differently depending on whose phone is open.

### The rule

Format wall clocks in SQL and send them as strings:

```sql
to_char(check_in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')  AS check_in_clock
(NOW() AT TIME ZONE 'Asia/Kolkata')::date                      -- "today", the estate's
```

A formatted string cannot be re-offset by anybody. Send instants **as well** where arithmetic needs
them, name the two differently (`checkInClock` vs `checkInTime`), and say in a comment which is for
display.

### Three ways this has actually broken, all silent

1. **`String(dateObject)` renders the SERVER's zone** and appends a human zone name. `lib/server/db`
   hands back JS `Date`s for timestamp columns, so `String(row.check_in_time)` produced a value
   whose meaning depended on where the code ran.
2. **`AT TIME ZONE` alone is not enough.** It yields a *naive* `timestamp`, which the driver then
   parses in the **server's** zone and serialises as an instant — so an IST wall clock of `08:00:51`
   left a UTC server as `08:00:51Z`. If the client then re-offsets it, the error compounds.
3. **Client-side formatting of a correct instant.** The value is right, the render is local.

Reported by HoneyFarm 2026-09-18 and worth keeping as the worked example: the muster showed
`04:31 – 13:18` for workers who punched `08:01 – 16:48`. The screenshot came from a phone in Africa,
3½ hours behind IST, and every row was exactly IST − 3:30. **The terminal and the ingest were
correct** — `check_in_time` held the right instant the whole time. Three endpoints read that column
and only `/api/attendance/report` was right, because it was the only one using `to_char`. The
report tab was worse than the reported bug: it did `AT TIME ZONE` *and* `toLocaleTimeString`, so an
08:00 punch read **13:30 in India**, and nobody had noticed.

### Testing this

A shape-only assertion (`/\d{1,2}:\d{2}/`) passes in every timezone, which is exactly why it cannot
see any of the above. `tests/render/attendance-muster.test.tsx` carried one, with a comment reading
*"Rendered in the runner's local zone, so assert the shape rather than the clock"* — a sentence that
names the product bug and treats it as a test constraint. **Assert the clock**, and re-render under
more than one `process.env.TZ`.

Also: `String(date).slice(0,10)` is the date-side signature of the same class, and "5:30 AM on every
row" is its display-side twin. CI sets no `TZ`, so a timezone-dependent test passes or fails on the
runner's accident.

---

## Client Reliability

### CSP is testable — keep it that way

Directives live in `lib/csp.mjs` (imported by `next.config.mjs`), verified by `tests/csp.test.ts`.
A CSP mistake fails **silently**: the browser drops the request and nothing is logged anywhere.
`connect-src` once read `https://o*.ingest.sentry.io`, which is not valid CSP host syntax (a
wildcard is only legal as the entire leftmost label) and would not have matched the EU region
host `o<org>.ingest.de.sentry.io` regardless. **Client-side Sentry reported nothing for months.**
Server-side Sentry was unaffected, which is why the project didn't look dead. If you add a
third-party endpoint the browser talks to, add it to `CONNECT_SRC` and a case to that test.

### Sentry wiring

- `instrumentation-client.ts` is the **only** browser entry point on SDK v10. The legacy
  `sentry.client.config.ts` was deleted — it was not loaded, so edits to it did nothing.
- `instrumentation.ts` exports `onRequestError = Sentry.captureRequestError`. **Do not remove
  it.** Without it, errors thrown out of route handlers, server actions and RSC renders are
  never reported; for a long time the only server errors reaching Sentry were those passed
  explicitly to `logServerError`.
- All three runtimes set `release` (`lib/observability.ts` → `resolveRelease()`), which is what
  makes "first seen in this release" and regression detection work.
- `beforeSend` on every runtime scrubs via `lib/redaction.ts`. Redaction rules live there,
  **not** in `lib/server/safe-logging.ts`, because that module imports Sentry and the config
  files would cycle.
- **Fingerprints are normalised** (`lib/observability.ts`). Log messages embed tenant ids and
  dates, so grouping on the raw message mints one issue per tenant. `normalizeForFingerprint`
  collapses uuids/dates/hex/numbers first. Note it avoids regex lookbehind — Safari only
  supports that from 16.4 and this module ships to the browser.
- Tenant/user context is attached client-side by `components/sentry-auth-sync.tsx` and
  server-side inside `toSessionUser` in `lib/auth-server.ts` (the one chokepoint every auth
  path funnels through). `tenant_id` is a **tag**, so it is searchable and alertable.
- `tracesSampleRate` only samples performance traces. Errors are never sampled.

### Crash beacon

`lib/crash-beacon.ts` + `components/crash-beacon.tsx`. When iOS kills the WebKit content process
under memory pressure, JS stops mid-instruction — no error, no handler, no request. **A process
kill is unobservable from inside the process**, so no in-page reporter can ever catch one. The
beacon heartbeats to `localStorage` and reports on the *next* load. Reports via Sentry *and*
PostHog deliberately: a single blocked transport is what hid the original problem.

Only a session that went stale **while visible** with no `pagehide` is reported as a crash — a
stale *hidden* session is a routine iOS background reclaim and alerting on it would bury the signal.

### Request cancellation

`lib/abortable.ts` + `hooks/use-abortable.ts`.

- **Reads only. Never abort a mutation.** Aborting a POST/PUT/DELETE does not roll back the
  server; the client reports failure for a write that committed, the user retries, and you get
  duplicate records — the exact damage `lib/single-flight.ts` exists to prevent. Mutations get
  single-flight and are allowed to finish.
- The old pattern was `let ignore = false` flipped in effect cleanup. That stops the stale
  `setState` but **not** the request: the response still downloads in full and still gets
  JSON-parsed before being discarded. Several dashboard endpoints are `all=true` full-table
  reads, so burst tab-switching on a phone stacked up whole record sets. Use an AbortController.
- Two sites intentionally still use a stale flag: `verify-email-page.tsx` (a POST — must not be
  aborted) and the workspace-bootstrap effect in `inventory-system.tsx` (fires on tenant change,
  not on interaction; cancelling it means threading signals through three separate useCallbacks).

## Cron Jobs

- Vercel cron: `GET /api/cron/orchestrator` runs daily at 02:00 UTC
- Weekly digest agent runs Monday mornings; includes market timing section when `ALPHAVANTAGE_API_KEY` is set

### Dormancy gate (shared by the digest and probe agents)

`lib/server/agents/tenant-dormancy.ts` is the single source of truth for "has this estate gone
quiet?". The **weekly digest, daily digest, and dormancy probe** all read it, so **a tenant not
receiving mail is usually policy, not a bug** — check `agent_runs.summary.dormantSkipped` and
the per-tenant `skipped` results before chasing a delivery failure.

Three lifecycle states, not two:

- **Unactivated** — never logged in *and* never wrote a row. Gets **no automated email at all**:
  no daily digest, no weekly digest, no dormancy probe. An operations report about an estate
  nobody has opened is nonsense, and "haven't seen you in a few days" implies a lapse that never
  happened. Both conditions are required — a tenant with data but no login event is an older
  account whose logins predate the `security_events` trail, not a fresh one.
- **Dormant** — activated, then went quiet. Probe fires after 4 quiet days, once per dormancy
  episode. Digests stand down after `DIGEST_QUIET_DAYS` (14) with no activity of either kind,
  and never before `DIGEST_MIN_TENANT_AGE_DAYS` (14). Tune those two constants. The 4-vs-14
  threshold is the *only* difference between the two policies — both read the same signals.
- **Active** — normal sending.

- Activity = last login **OR** last human data write, whichever is newer. Both matter: sessions
  are 30 days, so an actively-used tenant can show a three-week-old `auth_login_success` event.
  Gating on login alone silences nothing but *mis*-fires: it sent a "haven't seen you in a few
  days" probe to Medappa Estates on 2026-08-12 while their writer was marking attendance daily
  from a session opened a week earlier. The probe used to gate on login alone; it no longer does.
- "Human" write is load-bearing: biometric punches (`attendance_records.source = 'biometric'`)
  are excluded, because a terminal on a timer would otherwise keep an abandoned estate looking
  active forever. Manual attendance still counts. See `buildDataWriteUnionSql`.
- An episode closes when anything happens *after* `last_probe_sent_at` — not by matching the
  stored `last_known_activity_at`, which is now written for forensics only.
- Both digest gates **fail open** — if the signal query errors, everyone gets a digest as before.
- Force a send to a quiet tenant: `?includeDormant=1` on `/api/cron/weekly-digest` or
  `/api/cron/daily-digest`.
- ⚠️ **Manually-created tenants have no `signup_requests` row**, so the onboarding nudge agent
  (which keys off that table) never picks them up. Combined with the unactivated rule they
  receive *nothing* — onboarding them is a human job. Check this before assuming a new tenant
  is in an automated nurture sequence.
- Digest bodies are not persisted anywhere (`digest_feedback` stores only ratings). The only
  archive of what was actually sent is the BCC to `support@thefarmflow.in` and Resend's logs.

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

**Current state:** merging to `main` auto-deploys straight to production — no staging environment,
no manual promotion gate. **`main` itself is gated** (below), so nothing arrives unreviewed or
untested, but the moment it arrives it is live for every tenant.

**A gate AT VERCEL is not available on this plan. A gate AT GITHUB is — see
[docs/RELEASE-FLOW.md](docs/RELEASE-FLOW.md).**

✅ **APPLIED AND ENFORCING — verified 2026-09-15.** Ruleset `"main is production"` (id 23031114),
`enforcement: active`, on `refs/heads/main`:

| Rule | Setting |
|---|---|
| `pull_request` | required, 0 approvals (solo maintainer) |
| `required_status_checks` | `quality` must be green |
| `non_fast_forward` | force-push blocked |
| `deletion` | branch deletion blocked |

⚠ **This paragraph said "NOT YET APPLIED" from 2026-09-11 to 2026-09-15, and it was wrong for at
least part of that.** It also told you to check with `node scripts/dev/setup-main-ruleset.mjs`
rather than trusting it — which is the right instruction, and the reason it was caught. Keep doing
that; also `gh api repos/niksr4/farmflow/rulesets --jq '.[] | {name, enforcement}'`. A prose claim
about infrastructure state is a snapshot, and this file has now been wrong about two of them in
one section.

✅ **`gh` writes here now — RESOLVED 2026-09-15.** The active account is **niksr4** with
`{"admin":true,"maintain":true,"push":true,"triage":true,"pull":true}`. `gh pr create` works
(PRs #19 and #20 were opened with it) and **ruleset writes are no longer 403**, which unblocks
`pnpm release:gate --apply`. `origin` is SSH (`git@github.com:niksr4/farmflow.git`), so `git push`
was always fine. NikKaoss is still present in the keyring as an **inactive** second account —
harmless, but `gh auth switch` would re-break everything, so check the active one before concluding
a write is blocked.

⚠ **Read that as a lesson about this file, not just about `gh`.** From 2026-09-12 to 2026-09-15
this paragraph said the opposite, in bold, and it was believed over the tool: two PRs were handed
to the user to open by hand on 2026-09-15 because *this line* was quoted instead of
`gh auth status` being run. It costs one second to check:

```
gh api user --jq .login
gh api repos/niksr4/farmflow --jq .permissions
```

A capability claim in a doc is a snapshot of one afternoon. Verify before reporting something as
blocked — the same discipline as `feedback_verify_via_vercel` and `project_migration_ledger_lies`.

This section used to open by saying a structural gate was not available at all, and that reading
stood for seven weeks. It is wrong in a way worth spelling out: *reaching `main`* and *reaching
production* are the same event here, so a gate does not have to live at the deploy step. **The
repository is public**, which makes GitHub rulesets free, and the script requires a pull request
plus a green `quality` check before anything can land on `main`. Merging is still the release, and
still needs the human word — but nothing would arrive on `main` unreviewed and untested.

Everything below about Vercel remains true and the domain-`gitBranch` warning still stands.
Investigated 2026-07-21:
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

**What actually works — the CLI staged-deploy workflow.** It builds with Production-tier
classification, so it does not suffer the Preview-tier problem that caused the outage above:

1. `vercel --prod --skip-domain` — builds a real production deployment (production env vars, prod
   behavior) but does **not** point thefarmflow.in at it. Safe to build without any customer
   seeing it.
2. Verify it: `vercel inspect <deployment-url>` and `vercel logs <deployment-url>`.
   ⚠️ **You cannot click around this URL.** This doc used to claim the deployment is "genuinely
   public, no login wall" and told you to browse it before promoting — that is false, and was
   corrected 2026-08-13 after observing a clean `302 → vercel.com/sso-api` on a fresh
   `--skip-domain` build. The project sets `ssoProtection.deploymentType =
   "all_except_custom_domains"`, so *every* URL except the custom domain sits behind Vercel's SSO
   wall. The deployment becomes browsable at the exact moment it becomes live, so **step 2 buys you
   build success and logs, not a functional smoke test.** Do your real verification locally
   (`pnpm test`, `pnpm typecheck`, `pnpm build`, a dev-server browser pass) before step 3, and
   keep the rollback command ready. To get a genuinely browsable pre-production URL you would
   have to relax `ssoProtection` to `standard_protection`, which exposes every preview build —
   don't do that casually.
3. `vercel alias set <deployment-id> www.thefarmflow.in` (or `vercel promote <deployment-url-or-id>`)
   — this is the moment it actually goes live *and* the first moment you can browse it.

Rollback: `vercel alias set <previous-known-good-deployment-id> www.thefarmflow.in`, or
`vercel rollback`.

This needs zero dashboard/plan changes and works today via the authenticated CLI (`Vercel_token` in
`.env.local`, passed as `--token`; see `reference_vercel_cli_token` memory). The auto-deploy-per-push
behavior on `main` keeps working exactly as before for anyone who pushes without using this flow —
so the actual discipline is: **stop pushing straight to `main` for anything you want gated, build and
alias deliberately instead using the sequence above.**

---

## Built But Unadopted (check adoption before ranking a bug here)

A coherent slice of the product is fully built, shipped, and used by **nobody**. It is kept
deliberately — every part of it is optional and nullable, nothing breaks with it empty, and
deleting it would cost a multi-table migration to reclaim no runtime cost.

**Verified against production 2026-07-28:**

| Surface | Adoption |
|---|---|
| Lot traceability (`lot_id` on processing/dispatch/sales/curing/quality/documents, `app/lot/[lotId]`, `app/api/lots/[lotId]`) | **0** lot_ids in `processing_records` across all tenants; 1 stray on a dispatch row |
| `curing`, `quality`, `receivables`, `billing` modules | enterprise-only; **0** tenants on the `enterprise` plan — all 6 are `core` |
| `compliance`, `documents`, `market-pricing`, `plant-health`, `yield-forecast` | same — enterprise-only, no tenant has them |

**Why this matters when triaging:** an endpoint here returning nothing is almost always
"no data exists" rather than "broken." A 2026-07-28 QA cycle raised `app/api/lots/[lotId]`
as a red finding; it was fixed, then reverted, once the data showed the endpoint 404s for
every possible input regardless. **Ask whether a feature has any rows before ranking a
finding on it** — the difference between a live customer-facing break and dormant code is
one query, and severity is meaningless without it.

Lot traceability is the spine of the enterprise tier (curing + quality + documents all key
off `lot_id`), so this is really one dormant *product tier*, not eight separate features.
The current tenants are commodity growers selling bulk parchment to curing works — their own
sales data shows buyers like TATA Coffee, VSSSN and Allanasons — and lot identity dissolves
at the curer, so traceability is the curer's problem, not the estate's. Estates that need
lot IDs sell micro-lots direct at a premium. None do yet.

**Don't invest here until a customer asks.** Export-side traceability requirements are the
plausible future trigger. If lot traceability is adopted, `app/api/lots/[lotId]` will not
start working on its own — see the decision recorded in that route's header comment.

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
