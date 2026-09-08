-- 150: overtime hours, recorded once a day against a name.
--
-- Manoj, 2026-09-08: "my normal work is 8 hours. However please don't tie the OT to the number of
-- hours worked during the day. let it be a separate entry at a muster level where the writer enters
-- the day and the number of hours on any day against the name of the worker on the day overtime is
-- done."
--
-- WHY attendance_records AND NOT labour_assignments.
--
-- The obvious home is the allocation row, next to day_fraction and rate. It is the wrong one. An
-- assignment is per worker PER JOB PER BLOCK -- a worker weeding in the morning and lining in the
-- afternoon has two rows for one day. Overtime hung there could be entered twice for one evening's
-- work, and the second entry would look exactly as legitimate as the first: no error, no warning, a
-- correct-looking wage that is double.
--
-- attendance_records is one row per worker per day. It IS the muster roll, which is the level Manoj
-- named, and the grain makes double entry structurally impossible rather than something a guard has
-- to catch.
--
-- WHAT THIS COSTS, stated rather than discovered later: attendance_records has no location_id, so
-- overtime is not directly attributable to a block. For cost-per-block, apportion the day's overtime
-- across that day's assignments by day_fraction -- a worker who spent half the day on Block A and
-- half on Block B carries half the overtime cost to each. That is derivable from data already
-- recorded and is the honest answer; putting the hours on one of the two rows would attribute all
-- of it to whichever job happened to be entered first.
--
-- NOT DERIVED FROM PUNCH TIMES, on his explicit instruction. Only HoneyFarm has a terminal --
-- verified 2026-09-08: Medappa hold 787 attendance rows and zero with a check_in_time, all manual.
-- An estate with no scanner cannot have overtime inferred from one, which is the whole reason this
-- is a typed number.
--
-- Note this is a DIFFERENT NUMBER from lib/attendance-hours.ts's DEFAULT_FULL_DAY_HOURS (6), and
-- they must not be merged. That 6 is the threshold for deciding whether a PUNCH PAIR counts as a
-- full or half day, and applies only to tenants with a terminal. Manoj's 8 is how many hours a
-- day's wage buys, which is the divisor for an hourly overtime rate: Rs 600 over 8 hours is Rs 75,
-- over 6 it is Rs 100, and using the wrong one makes every overtime payment a third too high. The
-- pay divisor lives on worker_pay_rules.full_day_hours (scripts/149); the attendance threshold
-- stays where it is.

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(5,2) NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_overtime_hours_check') THEN
    -- Upper bound is a typo guard, not a policy: nobody works 17 hours of overtime, and a stray
    -- keystroke that turns 2 into 22 should be refused at the column rather than paid.
    ALTER TABLE attendance_records
      ADD CONSTRAINT attendance_records_overtime_hours_check
      CHECK (overtime_hours IS NULL OR (overtime_hours > 0 AND overtime_hours <= 16));
  END IF;
END $$;

COMMENT ON COLUMN attendance_records.overtime_hours IS
  'Overtime hours typed against a worker for a day. NULL = none. Per worker per day, never per job -- see scripts/150. Priced by worker_pay_rules.overtime_mode/value, not by punch times.';

-- Only rows that carry overtime, which is almost none of them.
CREATE INDEX IF NOT EXISTS attendance_records_overtime
  ON attendance_records (tenant_id, attendance_date)
  WHERE overtime_hours IS NOT NULL;

DO $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance_records' AND column_name = 'overtime_hours'
  ) THEN
    RAISE EXCEPTION '150: attendance_records.overtime_hours was not added';
  END IF;

  -- Nothing existing may acquire overtime by being migrated. Every row was worked before anybody
  -- could record any, so every row must still say NULL.
  SELECT COUNT(*) INTO n FROM attendance_records WHERE overtime_hours IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '150: % existing attendance row(s) gained overtime -- the default is wrong', n;
  END IF;
END $$;
