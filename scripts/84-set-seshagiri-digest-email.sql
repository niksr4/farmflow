-- Set digest email for the seshagiri tenant's admin user.
-- Run once in Neon console. Safe to re-run (idempotent).

UPDATE users
SET digest_email = 'nanda.alaganan@gmail.com'
WHERE tenant_id = (
  SELECT id FROM tenants WHERE LOWER(BTRIM(name)) = 'seshagiri' LIMIT 1
)
  AND role = 'admin'
  AND (digest_email IS NULL OR BTRIM(digest_email) = '');
