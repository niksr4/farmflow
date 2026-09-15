-- Allow owner role in users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'owner'));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠ THIS FILE USED TO CARRY A REAL, WORKING PASSWORD HASH. THIS REPOSITORY IS PUBLIC.
--
-- The line below held an unsalted SHA-256 hash for the `owner` account. lib/passwords.ts still
-- treats any 64-hex value as a LIVE `legacy_sha256` login, not a disabled artifact, so whoever
-- recovered the plaintext -- an offline brute force against a hash published on GitHub -- would
-- have logged in as owner. Raised by the QA scanner on 2026-09-16.
--
-- VERIFIED THE SAME DAY, against both databases, before changing anything:
--
--   production   0 rows carry that hash; all 11 accounts are scrypt, `owner` included
--   dev          0 rows carry that hash; 0 of 10 accounts are legacy_sha256
--
-- So nothing was exposed and there was nothing to rotate. The live danger was the NEXT line, not
-- that one: `ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash` meant
-- that re-running this migration -- `psql -f`, a restore, a fresh bootstrap, anyone copying this
-- file as a template -- would have RESET the real owner password to the published value and made
-- the exposure real at that moment. One command away, silently, with no error.
--
-- Two changes, and both matter:
--
--   1. The hash is gone. The placeholder is deliberately NOT 64 hex characters, so
--      classifyStoredPasswordHash reports `legacy_plaintext`, which verifyPassword refuses
--      unconditionally -- it can never authenticate, and it is greppable if it ever lands in a
--      row. A "safe-looking" hex placeholder would have been the opposite of safe.
--   2. The upsert NO LONGER TOUCHES password_hash. Re-running this file now fixes up the role and
--      tenant of an existing owner and leaves their credential alone, which is what it should
--      always have done: a schema migration has no business rewriting a password.
--
-- Git history still contains the old hash and a public repo cannot unpublish it. That is
-- tolerable precisely because it is used nowhere -- but it is why the fix is "never let it come
-- back" rather than "delete it and move on". tests/no-credentials-in-migrations.test.ts enforces
-- both halves across every script in the repo.
--
-- To create the first owner on a fresh database, set the password through the app (which writes
-- scrypt) or via scripts/64-password-hardening.mjs. Deliberately not automated here.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
WITH default_tenant AS (
  SELECT id
  FROM tenants
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO users (username, password_hash, role, tenant_id)
SELECT 'owner', 'NO-LOGIN-set-a-password-through-the-app', 'owner', id
FROM default_tenant
ON CONFLICT (username) DO UPDATE
SET role = 'owner',
    tenant_id = EXCLUDED.tenant_id;
