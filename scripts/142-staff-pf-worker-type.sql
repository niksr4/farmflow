-- 142: staff_pf -- staff who are on provident fund, which estates distinguish from staff who are not.
--
-- Seshagiri's payroll export has both "Staff/PF" and "Staff" as separate categories, the same way
-- HoneyFarm separates "Chkroll/PF" from "Casuals". PF membership decides what an estate owes
-- beyond the wage and what it has to file, so it is a distinction they make deliberately.
--
-- Flattening both into `staff` would be the cheap move and unrecoverable: once two people are
-- stored identically, nothing in the data says which of them was on PF, and the answer only exists
-- in a PDF somebody exported once.
--
-- The list is expected to keep growing -- these are estates' own words for how someone is engaged,
-- not a taxonomy we get to close. Widening a CHECK costs nothing, which is why this is a CHECK and
-- not an enum: adding a value to a Postgres enum cannot run inside a transaction, and a migration
-- runner should not have to know that.

ALTER TABLE attendance_workers
  DROP CONSTRAINT IF EXISTS attendance_workers_worker_type_check;

ALTER TABLE attendance_workers
  ADD CONSTRAINT attendance_workers_worker_type_check
  CHECK (worker_type IS NULL OR worker_type = ANY (ARRAY[
    -- how they are paid
    'staff'::text,
    'staff_pf'::text,
    'chkroll_pf'::text,
    'casuals'::text,
    'seasonal_assam'::text,
    'proprietor'::text,
    -- retained from the original list, still in use, not migrated
    'permanent'::text,
    'seasonal'::text,
    'contractor'::text
  ]));

DO $$
DECLARE
  rejected INTEGER;
BEGIN
  SELECT COUNT(*) INTO rejected
  FROM attendance_workers
  WHERE worker_type IS NOT NULL
    AND worker_type <> ALL (ARRAY['staff','staff_pf','chkroll_pf','casuals','seasonal_assam',
                                  'proprietor','permanent','seasonal','contractor']);

  IF rejected > 0 THEN
    RAISE EXCEPTION '142: % worker(s) hold a type the constraint now rejects', rejected;
  END IF;
END $$;
