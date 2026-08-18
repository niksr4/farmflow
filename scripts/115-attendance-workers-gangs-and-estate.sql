-- 115: Let the muster roll hold contract gangs, and tag each worker to an estate.
--
-- SETTLED AND APPLIED ON DEV. The gang model this was blocked on was confirmed with Medappa on
-- 2026-08-17: a gang is one roster row with an editable per-day headcount, plus driver,
-- supervisor and vehicle charges recorded separately. `kind`/`headcount` below are that answer.
-- Safe to run on prod -- verified 2026-08-18 against 49 existing workers, none of which violate
-- the new CHECK (kind defaults to 'individual', headcount to NULL).
--
-- Two problems, one table.
--
-- GANGS. Medappa's labour is not all employees. "Rathi & Team" -- a contract gang of 9-12
-- people -- worked 3-6 August 2026 and is a third of the headcount on those days. They are not
-- on the roster because they are not individuals, so today they exist only as a free-text group
-- label inside labor_transactions.labor_entries. That free text has already drifted: the same
-- gang appears as both "Rathi & Team" and "Rathi &  Team" (double space) within four days.
-- Anything we later group by has to be selectable, not typed. Putting gangs on the roster as
-- first-class rows is also what allows the labour entry form to be retired entirely -- without
-- it, a third of the headcount would have nowhere to go.
--
-- ESTATE. Script 112 gave workers a location_id, and the estate filter resolves that location's
-- estate. That works, but it asks the wrong question: the picker offers Medappa's 21 blocks when
-- the answer is one of 2 estates, and the app then discards the block and displays only the
-- estate. A worker is based at an estate; a *deployment* happens on a block. Two different
-- facts, and one column was doing both jobs.
--
-- location_id is deliberately left in place. It is backfilled from, not replaced by, `estate`,
-- so nothing breaks mid-rollout and the old filter keeps working until the new one is proven.

ALTER TABLE attendance_workers ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'individual';
ALTER TABLE attendance_workers ADD COLUMN IF NOT EXISTS headcount INTEGER;
ALTER TABLE attendance_workers ADD COLUMN IF NOT EXISTS estate TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_workers_kind_check') THEN
    ALTER TABLE attendance_workers
      ADD CONSTRAINT attendance_workers_kind_check CHECK (kind IN ('individual', 'gang'));
  END IF;

  -- A gang without a headcount is unusable (it is the only thing that makes its cost
  -- computable), and a headcount on an individual is meaningless. Enforced rather than trusted:
  -- the whole point of promoting gangs out of free text is that they stop being loosely typed.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_workers_headcount_check') THEN
    ALTER TABLE attendance_workers
      ADD CONSTRAINT attendance_workers_headcount_check CHECK (
        (kind = 'gang' AND headcount IS NOT NULL AND headcount >= 1)
        OR (kind = 'individual' AND headcount IS NULL)
      );
  END IF;
END $$;

-- Backfill the estate from whichever block the worker was assigned to. Anyone who assigned
-- workers to a block before this lands loses nothing -- their answer converts exactly, which is
-- why it was safe to tell estates to start assigning immediately.
UPDATE attendance_workers w
SET estate = l.estate
FROM locations l
WHERE l.id = w.location_id
  AND l.estate IS NOT NULL
  AND w.estate IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_workers_tenant_estate
  ON attendance_workers (tenant_id, estate) WHERE estate IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_workers_tenant_kind
  ON attendance_workers (tenant_id, kind);

-- The active-name uniqueness index (idx_attendance_workers_tenant_name_active) already covers
-- gangs: two crews cannot share a name, which is precisely the "Rathi &  Team" failure.
