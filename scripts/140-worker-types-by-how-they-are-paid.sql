-- 140: worker types describe how someone is paid, not their employment status.
--
-- permanent / seasonal / contractor is a human-resources vocabulary. What an estate needs when
-- costing a day is how the money works, and those are different questions: a permanent writer on a
-- monthly salary and a permanent field hand on a daily wage are both "permanent" and could not be
-- more different to the muster.
--
-- The new values are HoneyFarm's own payroll vocabulary, taken from their SmartHCM export:
--
--   staff           paid monthly. No daily rate, so the muster cannot cost their day -- correct,
--                   not a limitation. Their salary is a kind of labour cost the product does not
--                   model yet (see the parked labour_charges note in STATUS.md).
--   chkroll_pf      check roll, with provident fund. Rs 494/day at HoneyFarm.
--   casuals         Rs 494/day.
--   seasonal_assam  migrant seasonal labour. Rs 460/day.
--   proprietor      on the roll for attendance, not paid a daily wage.
--
-- THE OLD THREE STAY VALID. 57 rows across Laxmi (12 permanent, 8 seasonal), Medappa (23/10/1) and
-- Estate Mock (3) were written in good faith against the list that existed. Rewriting them would
-- mean deciding on those estates' behalf that their "permanent" is HoneyFarm's "chkroll_pf", and
-- nobody has said that. Widening the constraint costs nothing; guessing would cost their data.
--
-- A CHECK rather than an enum, because that is what is already here and because adding a value to
-- a Postgres enum cannot be done inside a transaction -- which is exactly the kind of surprise a
-- migration runner should not have to know about.

ALTER TABLE attendance_workers
  DROP CONSTRAINT IF EXISTS attendance_workers_worker_type_check;

ALTER TABLE attendance_workers
  ADD CONSTRAINT attendance_workers_worker_type_check
  CHECK (worker_type IS NULL OR worker_type = ANY (ARRAY[
    -- how they are paid
    'staff'::text,
    'chkroll_pf'::text,
    'casuals'::text,
    'seasonal_assam'::text,
    'proprietor'::text,
    -- retained, in use, not migrated
    'permanent'::text,
    'seasonal'::text,
    'contractor'::text
  ]));

DO $$
DECLARE
  orphaned INTEGER;
BEGIN
  -- Every existing value must still satisfy the widened constraint. If this ever fails, the
  -- constraint above dropped a value somebody is using.
  SELECT COUNT(*) INTO orphaned
  FROM attendance_workers
  WHERE worker_type IS NOT NULL
    AND worker_type <> ALL (ARRAY['staff','chkroll_pf','casuals','seasonal_assam','proprietor',
                                  'permanent','seasonal','contractor']);

  IF orphaned > 0 THEN
    RAISE EXCEPTION '140: % worker(s) hold a type the new constraint rejects', orphaned;
  END IF;
END $$;
