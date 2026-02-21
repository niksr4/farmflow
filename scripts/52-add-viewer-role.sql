-- Add read-only viewer role support for tenant users.
-- Safe to run multiple times.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'viewer', 'owner'));
