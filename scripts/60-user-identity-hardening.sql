-- Auth hardening for username uniqueness and session identity safety.
-- Apply after resolving any existing username collisions that differ only by case or whitespace.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT LOWER(BTRIM(username)) AS normalized_username
      FROM users
      GROUP BY LOWER(BTRIM(username))
      HAVING COUNT(*) > 1
    ) duplicate_usernames
  ) THEN
    RAISE EXCEPTION
      'Cannot apply username hardening: duplicate usernames exist after trim/lower normalization. Resolve duplicates first.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_normalized_unique
  ON users (LOWER(BTRIM(username)));
