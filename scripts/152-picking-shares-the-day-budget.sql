-- 152: A worker has one day, and picking spends from the same day as day-work.
--
-- WHY NOW, AND WHY IT IS CHEAP EXACTLY NOW. scripts/116 has flagged the consequence since the
-- muster shipped: "a picker who also gets a labour_assignment for the same day is counted twice in
-- any cost-per-block figure". It has been harmless only because picking_records has ZERO ROWS --
-- verified on prod and dev on 2026-09-30, across every tenant.
--
-- That zero is the whole reason this migration is small. Compare 145, which had to invent a
-- downward-edit exemption because HoneyFarm already had 81 worker-days over a day by the time the
-- cap arrived, and those rows had to stay correctable. Picking starts clean: NOT NULL DEFAULT 1.0
-- needs no backfill decision and the cap has nothing to grandfather. The same change after a
-- harvest means reconciling real wage records against a limit they were written without.
--
-- Manoj has already given the rule -- a field is piece rate OR day wages, never both. The open
-- question of whether a picking day can be partial does NOT block this: DEFAULT 1.0 encodes "a
-- picking day is a whole day", which is the answer to assume, and a fraction becomes writable
-- later without touching this guard.
--
-- WHY A TRIGGER RATHER THAN A CHECK IN EVERY COST QUERY. The alternative is a cross-check inside
-- each cost reader, which is more code in more places and one of them will be forgotten -- the
-- exact shape of the labour_cost bug scripts/122 fixed, where a whole write path had no reader.
-- One shared budget, enforced where the row is written, cannot be bypassed by a new reader.

ALTER TABLE picking_records
  ADD COLUMN IF NOT EXISTS day_fraction NUMERIC(4,3) NOT NULL DEFAULT 1.0;

-- Same shape as labour_assignments.day_fraction, so the two arms of the budget cannot disagree
-- about what "half a day" rounds to.
ALTER TABLE picking_records
  DROP CONSTRAINT IF EXISTS picking_records_day_fraction_positive;
ALTER TABLE picking_records
  ADD CONSTRAINT picking_records_day_fraction_positive
  CHECK (day_fraction > 0 AND day_fraction <= 1.0);

/**
 * THE SHARED BUDGET. Takes explicit arguments rather than reading NEW, because the two tables
 * name their date column differently -- labour_assignments.work_date and picking_records.pick_date
 * -- and a single trigger function referencing NEW.work_date would raise at runtime on the other
 * table. Two thin wrappers below each know their own columns and call this.
 */
CREATE OR REPLACE FUNCTION assert_worker_day_budget(
  p_tenant_id UUID,
  p_worker_id UUID,
  p_day       DATE,
  p_adding    NUMERIC,
  p_source    TEXT,     -- 'labour_assignments' | 'picking_records'
  p_row_id    UUID,
  p_is_insert BOOLEAN
) RETURNS VOID AS $$
DECLARE
  labour_used  NUMERIC; labour_jobs  INTEGER;
  picking_used NUMERIC; picking_jobs INTEGER;
  used NUMERIC; jobs INTEGER;
  ceiling  CONSTANT NUMERIC := 1.0;  -- a day. Overtime is pay_multiplier, not a longer day.
  max_jobs CONSTANT INTEGER := 2;    -- morning and afternoon; a third is a data-entry slip
  where_txt TEXT;
BEGIN
  -- SERIALIZE THIS WORKER-DAY BEFORE READING EITHER SUM.
  --
  -- Without it the guard is a read-then-write race: two transactions -- one filing picking, one
  -- filing day-work -- both read the same pre-write totals under READ COMMITTED, both find room,
  -- and both commit. The stored result is over a day, and nothing raised an error anywhere, which
  -- is this project's signature failure rather than an exotic one. The same race lets a third job
  -- past the two-job limit.
  --
  -- scripts/145 has always had this hole for labour-against-labour. Making the budget shared widens
  -- it to two tables and two tabs that different people use at the same time during harvest, so it
  -- is worth closing here rather than inheriting.
  --
  -- Transaction-scoped: it releases on commit or rollback, with no unlock path to forget.
  -- hashtextextended for the 64-bit key space -- hashtext is int4 and collides far sooner, and a
  -- collision costs two unrelated worker-days a needless wait rather than costing correctness.
  -- Same mechanism as lib/server/password-reset.ts.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || p_worker_id::text || ':' || p_day::text, 0));

  /**
   * SELF-EXCLUSION IS PER TABLE. `id <> p_row_id` across both tables would be wrong: a
   * picking_records id could coincidentally equal a labour_assignments id (both uuid, different
   * sequences, nothing stops it), and excluding the wrong row would silently raise the ceiling.
   * The row being written is excluded only from its own table's total.
   */
  SELECT COALESCE(SUM(day_fraction), 0), COUNT(*) INTO labour_used, labour_jobs
  FROM labour_assignments
  WHERE tenant_id = p_tenant_id AND worker_id = p_worker_id AND work_date = p_day
    AND NOT (p_source = 'labour_assignments' AND id = p_row_id);

  SELECT COALESCE(SUM(day_fraction), 0), COUNT(*) INTO picking_used, picking_jobs
  FROM picking_records
  WHERE tenant_id = p_tenant_id AND worker_id = p_worker_id AND pick_date = p_day
    AND NOT (p_source = 'picking_records' AND id = p_row_id);

  -- Counted ACROSS both arms. Per-table counts would make the real limit four jobs, not two.
  used := labour_used + picking_used;
  jobs := labour_jobs + picking_jobs;

  /**
   * The message says WHERE the rest of the day already went. A writer told only "this worker
   * already has a day booked" has to go hunting across two tabs; naming the split points them at
   * the one holding the booking. Same reasoning as the muster's remove-work message.
   */
  where_txt := CASE
    WHEN picking_used > 0 AND labour_used > 0
      THEN format('%s from picking and %s from day-work on the muster', picking_used, labour_used)
    WHEN picking_used > 0 THEN format('%s from picking', picking_used)
    ELSE format('%s from day-work on the muster', labour_used)
  END;

  IF used + p_adding > ceiling + 0.0001 THEN
    RAISE EXCEPTION
      'A worker''s day is one day. This person already has % of % booked on % (%), and this adds % more. Picking and day-work share the same day: remove or halve the other entry first.',
      used, ceiling, p_day, where_txt, p_adding;
  END IF;

  IF p_is_insert AND jobs + 1 > max_jobs THEN
    RAISE EXCEPTION
      'This person already has % jobs on % (limit %), counting picking and day-work together. Correct one of them instead of adding another.',
      jobs, p_day, max_jobs;
  END IF;
END;
$$ LANGUAGE plpgsql;

/**
 * labour_assignments wrapper. Replaces the body of the 145 function; the trigger from 116 is
 * unchanged and keeps pointing at this name.
 */
CREATE OR REPLACE FUNCTION labour_assignments_day_cap() RETURNS TRIGGER AS $$
BEGIN
  -- A CORRECTION IS ALWAYS ALLOWED TO GO DOWN. Carried forward verbatim from 145: HoneyFarm has
  -- 81 worker-days already over a day, and the only way to fix one is to lower both jobs. Checking
  -- a reduction against the unreduced sibling fails every repair and leaves delete-and-retype as
  -- the sole route. Tightening a limit must never make the rows that broke it unfixable.
  IF TG_OP = 'UPDATE'
     AND NEW.worker_id = OLD.worker_id
     AND NEW.work_date = OLD.work_date
     AND NEW.day_fraction <= OLD.day_fraction THEN
    RETURN NEW;
  END IF;

  -- MOVING A ROW IS AN INSERT AS FAR AS THE DESTINATION DAY IS CONCERNED, so the job-count check
  -- must run for it too. `TG_OP = 'INSERT'` alone let an edit that re-dated an entry onto a day
  -- already holding two jobs skip the count entirely: the day-fraction check can pass while the row
  -- becomes a third job on a day this very file calls "a data-entry slip". Inherited from 145,
  -- which has the same gap.
  PERFORM assert_worker_day_budget(
    NEW.tenant_id, NEW.worker_id, NEW.work_date, NEW.day_fraction,
    'labour_assignments', NEW.id,
    TG_OP = 'INSERT'
      OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
      OR NEW.work_date IS DISTINCT FROM OLD.work_date);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

/** picking_records wrapper. Same rule, its own column names. */
CREATE OR REPLACE FUNCTION picking_records_day_cap() RETURNS TRIGGER AS $$
BEGIN
  -- Same downward-correction exemption, for the same reason. It costs nothing while picking has no
  -- rows, and the day it does have rows is the day somebody needs to halve one.
  IF TG_OP = 'UPDATE'
     AND NEW.worker_id = OLD.worker_id
     AND NEW.pick_date = OLD.pick_date
     AND NEW.day_fraction <= OLD.day_fraction THEN
    RETURN NEW;
  END IF;

  -- Same as the labour wrapper: a re-dated or reassigned row is new to its destination day.
  PERFORM assert_worker_day_budget(
    NEW.tenant_id, NEW.worker_id, NEW.pick_date, NEW.day_fraction,
    'picking_records', NEW.id,
    TG_OP = 'INSERT'
      OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
      OR NEW.pick_date IS DISTINCT FROM OLD.pick_date);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_picking_records_day_cap ON picking_records;
CREATE TRIGGER trg_picking_records_day_cap
  BEFORE INSERT OR UPDATE ON picking_records
  FOR EACH ROW EXECUTE FUNCTION picking_records_day_cap();

-- Should print zero on every environment; picking has no rows anywhere. If it ever does not, the
-- rows predate this guard and stay as they are -- same decision as 145, for the same reason: a
-- migration must not rewrite somebody's wage ledger.
DO $$
DECLARE over_booked INTEGER;
BEGIN
  SELECT COUNT(*) INTO over_booked FROM (
    SELECT 1 FROM (
      SELECT tenant_id, worker_id, work_date AS day, day_fraction FROM labour_assignments
      UNION ALL
      SELECT tenant_id, worker_id, pick_date AS day, day_fraction FROM picking_records
    ) every_arm
    GROUP BY tenant_id, worker_id, day
    HAVING SUM(day_fraction) > 1.0001
  ) t;
  IF over_booked > 0 THEN
    RAISE NOTICE 'worker-days over one day once picking is counted too: %. Left as-is; correct them in the muster.', over_booked;
  END IF;
END $$;
