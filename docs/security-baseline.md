# Security Baseline

## Passwords
- Passwords are hashed with salted `scrypt`; they are not encrypted.
- Legacy compatibility still exists for pre-hardening SHA-256 and plaintext records so existing users are not locked out mid-upgrade.
- Audit/remediation script: `pnpm security:passwords`
- Safe operator flow:
  - `pnpm security:passwords`
  - `pnpm security:passwords --apply-plaintext`
  - `pnpm security:passwords --flag-legacy-sha`
- Remove legacy verification only after the audit shows zero `legacy_sha256` and zero `legacy_plaintext` records.

## Admin Auth
- Admin and owner API access currently relies on the primary authenticated session only.
- MFA is not enabled in the product at this time.
- Module and role checks are enforced in route handlers; deny-by-default access comes from module gating plus admin/owner role checks on privileged routes.

## Encryption
- In transit: TLS enforced for browser traffic, cookies, and outbound integrations over HTTPS.
- At rest: Managed by the underlying cloud providers (Vercel + Neon).
- App-layer encryption:
  - `document_records.file_data_base64` is encrypted before database storage.
  - `privacy_requests.request_details` is encrypted before database storage.
- Passwords are intentionally excluded from app-layer encryption because hashing is the correct control.

## Secrets Management
- Secrets stored in environment variables (`.env.local` for dev, platform secrets in prod).
- Core runtime validation now fails startup when `NEXTAUTH_SECRET` or the active database URL is missing.
- Prefer a dedicated `APP_DATA_ENCRYPTION_KEY`; if omitted, the app derives the field-encryption key from `NEXTAUTH_SECRET` for backward-compatible rollout.
- Rotate credentials after incidents or personnel changes.

## Least-Privilege DB Roles
- Create dedicated read/write roles for application access instead of using owner credentials.
- Script: `scripts/44-db-roles.sql`.
- Restrict DDL to admin-only connections.
- Track role credentials in secrets manager.

## TLS / Proxy Assumptions
- Production TLS is expected to terminate at a trusted proxy/load balancer/CDN that forwards `x-forwarded-proto`.
- The app redirects non-HTTPS production traffic based on that trusted header.
- Secure cookies are enabled in production.

## Abuse / DDoS Controls
- App-level controls now include request-size caps, auth/public/internal rate limits, and explicit outbound HTTP timeouts.
- Sensitive production rate limits (login, signup, password change, internal ingest) require Redis-backed distributed enforcement; local in-memory fallback is development-only.
- Cheap rejection is handled in middleware using `Content-Length` before expensive request parsing where possible.
- Volumetric DDoS protection still belongs at the CDN/WAF/load-balancer layer, not inside the Next.js app.
