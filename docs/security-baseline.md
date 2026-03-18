# Security Baseline

## Admin Auth
- Admin and owner API access currently relies on the primary authenticated session only.
- MFA is not enabled in the product at this time.

## Encryption
- In transit: TLS enforced for all requests (Next.js + Neon over SSL).
- At rest: Managed by the underlying cloud providers (Vercel + Neon).

## Secrets Management
- Secrets stored in environment variables (`.env.local` for dev, platform secrets in prod).
- Rotate credentials after incidents or personnel changes.

## Least-Privilege DB Roles
- Create dedicated read/write roles for application access instead of using owner credentials.
- Script: `scripts/44-db-roles.sql`.
- Restrict DDL to admin-only connections.
- Track role credentials in secrets manager.
