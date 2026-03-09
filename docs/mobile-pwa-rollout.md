# Mobile + PWA Rollout Plan

This project is optimized for:
- phone-friendly access
- home screen install
- app-like feel
- optional offline expansion later

## Current Baseline (Shipped)
- Mobile-first workspace navigation and actions in `components/inventory-system.tsx`.
- PWA metadata and installability:
  - `app/manifest.ts`
  - `app/layout.tsx`
  - `components/pwa-install-prompt.tsx`
  - `components/pwa-register.tsx`
- HTTPS requirement: Vercel production and preview domains are HTTPS by default, and app-level HTTPS redirect/HSTS headers are configured.
- Service worker + offline shell + write queue implementation in `public/sw.js`.
- Mobile regression checks in `tests/e2e/mobile-phone-smoke.spec.ts`.

## Optional Runtime Toggles
Use `.env` values to tune offline behavior without code changes:
- `NEXT_PUBLIC_PWA_NAV_CACHE=false` to disable navigation/page caching.
- `NEXT_PUBLIC_PWA_STATIC_CACHE=false` to disable static asset runtime cache.
- `NEXT_PUBLIC_PWA_READ_API_CACHE=false` to disable read-API cache fallback.
- `NEXT_PUBLIC_PWA_READ_API_TIMEOUT_MS=3500` to control read API network timeout before cache fallback.
- `NEXT_PUBLIC_PWA_WRITE_QUEUE=false` to disable offline write queueing.
- `NEXT_PUBLIC_PWA_WRITE_TIMEOUT_MS=12000` to control write timeout before queuing offline.
- `NEXT_PUBLIC_PWA_WRITE_QUEUE_MAX=400` to cap queued writes and avoid unbounded offline buildup.
- `NEXT_PUBLIC_ENABLE_PWA_DEV=true` to allow service worker registration in local dev.
- `AUTH_APP_SESSION_MAX_AGE_SECONDS` to control installed-app sign-in duration (default `2592000` / 30 days).
- `AUTH_WEB_SESSION_MAX_AGE_SECONDS` to control browser sign-in duration (default `43200` / 12 hours).

## Phase 1: Phone + Install First (Now)
Goals:
- no horizontal overflow on key pages
- clean tap targets / bottom safe-area support
- install prompt shown in app context only

Status:
- Global mobile overflow hardening in `app/globals.css`.
- Install prompt scoped to dashboard + secure contexts in `components/pwa-install-prompt.tsx`.
- Service worker registration restricted to secure runtime in `components/pwa-register.tsx`.

## Phase 2: App-like Reliability (Now)
Goals:
- predictable foreground sync behavior
- stable shell updates

Status:
- Queue flush on online, controller change, and app foreground in `components/pwa-register.tsx`.
- Explicit service-worker update check after registration in `components/pwa-register.tsx`.

## Phase 3: Offline Depth (Later, Optional)
When to start:
- after stable install adoption and low mobile UI regression rate.

Recommended additions:
1. Feature flag offline writes (`NEXT_PUBLIC_PWA_WRITE_QUEUE`) and roll out tenant-by-tenant.
2. Add telemetry for queue depth, flush success rate, and dropped writes.
3. Add E2E offline scenarios for queued write + reconnect sync.
4. Add conflict resolution UX for stale edits.

## Release Checklist (Mobile/PWA)
1. Run `pnpm exec eslint components/pwa-install-prompt.tsx components/pwa-register.tsx components/inventory-system.tsx tests/e2e/mobile-phone-smoke.spec.ts`.
2. Run `pnpm test:e2e:mobile`.
3. Validate on iOS Safari:
   - Add to Home Screen
   - Launch from icon
   - Sign in and navigate core tabs
4. Validate on Android Chrome:
   - Install prompt flow
   - Basic online usage
