-- Set digest email for the seshagiri tenant's admin user.
-- Run once in Neon console. Safe to re-run (idempotent).
-- Replace REPLACE_WITH_DIGEST_EMAIL with the real address before running --
-- this file intentionally no longer carries a real address in source control
-- (a prior version hardcoded a specific person's personal email here, which
-- is unnecessary PII in a public repo once the migration has been applied).

DO $$
DECLARE
  target_email_text TEXT := 'REPLACE_WITH_DIGEST_EMAIL';
BEGIN
  IF target_email_text = 'REPLACE_WITH_DIGEST_EMAIL' THEN
    RAISE EXCEPTION 'Replace REPLACE_WITH_DIGEST_EMAIL with the real digest email before running.';
  END IF;

  UPDATE users
  SET digest_email = target_email_text
  WHERE tenant_id = (
    SELECT id FROM tenants WHERE LOWER(BTRIM(name)) = 'seshagiri' LIMIT 1
  )
    AND role = 'admin'
    AND (digest_email IS NULL OR BTRIM(digest_email) = '');
END $$;
