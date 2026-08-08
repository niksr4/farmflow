-- 112: Let each attendance worker be assigned to a specific location/estate.
--
-- Workers added before the estate selector existed (script 109) have no location association at
-- all, so a multi-estate tenant's attendance roster shows every worker regardless of which
-- estate is selected -- there's nothing to filter on. Nullable and additive: existing workers
-- stay unassigned (visible under every estate, same as any other unassigned record in this
-- codebase) until an admin explicitly assigns them via the worker profile edit form.

ALTER TABLE attendance_workers ADD COLUMN IF NOT EXISTS location_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_attendance_workers_location'
  ) THEN
    ALTER TABLE attendance_workers
      ADD CONSTRAINT fk_attendance_workers_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_workers_tenant_location ON attendance_workers (tenant_id, location_id);
