-- 113: Remember the name a worker was enrolled under on the fingerprint terminal.
--
-- The device sends it and we were throwing it away. Its realtime_enroll_data push carries
-- {"user_id":"2","user_name":"SUM", ...} plus the fingerprint template, and app/hdata.aspx
-- acknowledged and discarded the whole thing because only punches produce attendance.
--
-- That name is the ONLY place a device code is human-readable. Without it an estate does the
-- work twice: enrol 45 fingers on the terminal, then create 45 workers in FarmFlow and retype
-- each code by hand. With it, the mapping panel says "Code 5 — SUM" instead of "Code 5", which
-- turns retyping into confirming. That difference is what makes this usable past one estate.
--
-- Deliberately NOT auto-creating workers from an enrolment: a mistyped or test enrolment would
-- silently mint a payroll record. This stores a suggestion; a human still confirms it.
--
-- One row per code per tenant. Re-enrolling the same code (a worker re-registering a finger)
-- updates the name rather than accumulating history -- the current name is all the mapping UI
-- needs, and unbounded growth from a device that re-pushes on every reboot is a real risk.

CREATE TABLE IF NOT EXISTS biometric_enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_user_code  TEXT NOT NULL,
  user_name         TEXT,
  device_serial     TEXT,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_biometric_enrollments_tenant_code
  ON biometric_enrollments (tenant_id, device_user_code);

-- RLS must be declared HERE, not left to scripts/98's discovery sweep.
--
-- That sweep is a point-in-time snapshot and is already recorded in schema_migrations, so it
-- will never run again to pick up new tables. That is exactly how transaction_history_archive
-- (created by script 104, carrying tenant_id and real ledger data) reached production with no
-- policy at all, and it went unnoticed because `pnpm schema:rls` was not wired into CI. Any new
-- tenant_id table has to arm its own policy in the same migration that creates it.
ALTER TABLE biometric_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_enrollments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON biometric_enrollments;
CREATE POLICY tenant_isolation ON biometric_enrollments
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

-- The runtime role needs DML here like every other tenant table; a new table does not inherit
-- the grants applied to the ones that existed when the role was provisioned.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON biometric_enrollments TO app_runtime;
  END IF;
END $$;
