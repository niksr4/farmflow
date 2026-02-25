-- Allow owner role in users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'owner'));

-- Create/refresh owner login for the earliest tenant
WITH default_tenant AS (
  SELECT id
  FROM tenants
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO users (username, password_hash, role, tenant_id)
SELECT 'owner', '790bb5acdc0e4e42fcbfc4e5ff4ac9e2d48b34d95accf99cc373e9aa59c2f3e5', 'owner', id
FROM default_tenant
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    role = 'owner',
    tenant_id = EXCLUDED.tenant_id;
