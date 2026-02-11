# Security Baseline

## MFA
- Admins/owners must complete MFA to access admin APIs.
- MFA is TOTP-based (authenticator app).

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
