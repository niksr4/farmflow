-- 145: A worker's day is one day. Tightens the labour_assignments cap from 2.0 to 1.0, and caps
-- the number of jobs per worker per day at two.
--
-- WHY THE OLD CEILING WAS WRONG. Script 116 set the cap at 2.0 and justified it with overtime:
-- "INDICOFS 4.6.1B explicitly contemplates overtime ... a hard cap of one day would make a
-- legitimate long day unrecordable." That reasoning was sound when written and was overtaken by
-- the UI, which solved overtime a different and better way -- components/attendance/worker-
-- allocation.tsx offers Full, Half, and "Holiday 2x", where the last DOUBLES THE PAY AND LEAVES
-- THE DAY AT ONE, precisely so a block is not shown twice the labour it received. The client has
-- therefore never once emitted day_fraction > 1. The 2.0 ceiling protected nothing and permitted
-- the only thing it could permit: booking one person two full days by allocating twice.
--
-- WHICH IS WHAT HAPPENED. HoneyFarm, 27 August to 1 September 2026. KAB assigns work by selecting
-- people and picking a job, twice a day -- one batch for one job, another for the next. Both
-- batches used "Select all present", so most workers landed in both, at a full day each. He was
-- certain he had given most people one job; the muster agreed with him on screen, because nothing
-- anywhere added a worker's day up and said 2.0.
--
--   81 worker-days over-booked across 5 days. Rs 38,824 of labour cost that was never worked.
--
-- Nobody typed a wrong number. Two correct-looking actions composed into a wrong total, and the
-- one guard that could have caught it had been set to a ceiling that could not.
--
-- The exception message is read by a human -- app/api/attendance/assignments/route.ts surfaces it
-- and the muster shows it -- so it names the day and the totals rather than the worker uuid.

CREATE OR REPLACE FUNCTION labour_assignments_day_cap() RETURNS TRIGGER AS $$
DECLARE
  used  NUMERIC;
  jobs  INTEGER;
  ceiling  CONSTANT NUMERIC := 1.0;  -- a day. Overtime is pay_multiplier, not a longer day.
  max_jobs CONSTANT INTEGER := 2;    -- morning and afternoon; a third is a data-entry slip
BEGIN
  -- A CORRECTION IS ALWAYS ALLOWED TO GO DOWN.
  --
  -- Without this the cap is a trap rather than a guard. HoneyFarm has 81 worker-days already over
  -- a day; the way to fix one is to drop both jobs to half. But lowering job A from 1.0 to 0.5 is
  -- still checked against job B at 1.0 -- 1.5, over the ceiling -- so every attempt to correct the
  -- data fails and the only route left is delete-and-retype. Tightening a limit must never make
  -- the rows that broke it unfixable.
  --
  -- Restricted to edits that stay on the same worker and the same day: moving a row elsewhere is
  -- an insert as far as that day is concerned, and gets the full check.
  IF TG_OP = 'UPDATE'
     AND NEW.worker_id = OLD.worker_id
     AND NEW.work_date = OLD.work_date
     AND NEW.day_fraction <= OLD.day_fraction THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(day_fraction), 0), COUNT(*)
    INTO used, jobs
  FROM labour_assignments
  WHERE tenant_id = NEW.tenant_id
    AND worker_id = NEW.worker_id
    AND work_date = NEW.work_date
    AND id <> NEW.id;

  IF used + NEW.day_fraction > ceiling + 0.0001 THEN
    RAISE EXCEPTION
      'labour_assignments: worker % already has % of a day booked on % and this adds % more, which is more than one day. Two jobs in a day is half a day each.',
      NEW.worker_id, used, NEW.work_date, NEW.day_fraction;
  END IF;

  -- Only an INSERT adds a job; an UPDATE cannot take the count past the limit.
  IF TG_OP = 'INSERT' AND jobs + 1 > max_jobs THEN
    RAISE EXCEPTION
      'labour_assignments: worker % already has % jobs on % (limit %). Correct one of them instead of adding another.',
      NEW.worker_id, jobs, NEW.work_date, max_jobs;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger itself is unchanged from 116; only the function body moves.

-- EXISTING OVER-BOOKED ROWS ARE LEFT ALONE, DELIBERATELY.
--
-- The trigger is BEFORE INSERT OR UPDATE, so the 81 rows already over a day stay exactly as they
-- are and keep costing what they cost. That is on purpose: rewriting five days of somebody's wage
-- ledger from a migration is not a schema change, it is an accounting decision, and it belongs to
-- the estate that has to answer for the numbers. HoneyFarm has been told the figure.
--
-- They stay correctable, which is the point of the downward-edit exemption above: dropping each
-- of the two jobs to half a day works, in either order, without deleting anything.
DO $$
DECLARE
  over_booked INTEGER;
BEGIN
  SELECT COUNT(*) INTO over_booked FROM (
    SELECT 1 FROM labour_assignments
    GROUP BY tenant_id, worker_id, work_date
    HAVING SUM(day_fraction) > 1.0001
  ) t;
  IF over_booked > 0 THEN
    RAISE NOTICE 'labour_assignments: % worker-days are already booked over one day. Left as-is; correct them in the muster.', over_booked;
  END IF;
END $$;
