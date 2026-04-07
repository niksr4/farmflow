-- Add a dedicated notification email column to users.
-- This is separate from users.email (the auth/login credential) so that:
--   - Username-login tenants (e.g. honeyfarm) can set a digest address without
--     touching their auth record.
--   - Email-login tenants keep their login email intact when they change where
--     the weekly digest is sent.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS digest_email TEXT;
