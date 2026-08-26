-- 143: which estate a terminal stands on, and what a day's hours are worth.
--
-- Two things the biometric rollout needs that the schema could not express.
--
-- ── biometric_devices.estate ────────────────────────────────────────────────────────────────
-- HoneyFarm is putting one terminal at Honeyfarm and one at Sidapur, and each is enrolled with
-- only that estate's workers. The device row had no idea where it stood, so nothing could answer
-- "who should be on this scanner?" or "is this punch from the right place?".
--
-- NULLABLE, and null means "serves the whole tenant" -- the same always-shows rule locations and
-- workers already follow (lib/estate-filter.ts). Seshagiri run one estate and one terminal, and
-- making them label it would be ceremony with no meaning.
--
-- It deliberately does NOT restrict ingest. A punch from a worker tagged to the other estate is
-- still recorded: Dad's rule that a Honeyfarm worker never punches at Sidapur is an enrolment
-- decision made on the terminal, and if someone does turn up at the wrong one, silently dropping
-- the punch would erase a day they actually worked. The column is for showing the right roster and
-- for flagging surprises, not for refusing data. Work crisscrosses between estates freely and
-- always has -- allocation is per block and has never cared which terminal saw someone.
--
-- ── shift hours on tenants ──────────────────────────────────────────────────────────────────
-- Settings for this product live as columns on `tenants` (bag_weight_kg, alert_thresholds, ...),
-- so these go there rather than inventing a settings table for two numbers.
--
-- A worker's day used to be typed by whoever took the muster. With a terminal recording in and out
-- times, the hours can propose it instead: at or above full_day_hours is a full day, at or above
-- half_day_hours is half, below that is short and gets flagged rather than rounded.
--
-- PROPOSE, not decide. Nothing here writes labour_assignments.day_fraction. An estate knows why
-- someone left at noon and the terminal does not, so the hours are shown next to the roll and the
-- manager still allocates. Deriving pay straight from a fingerprint reader, on the first day, with
-- no human in between, is how one flat battery becomes an argument about wages.
--
-- Defaults are 7 and 3.5. Coffee estates work roughly 8-to-4 with a break; 7 hours of clocked time
-- is a comfortable full day and does not punish someone who left ten minutes early. Both are
-- per-tenant because nobody has told us these are right for anyone but ourselves.

ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS estate TEXT;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS full_day_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS half_day_hours NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_shift_hours_sane') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_shift_hours_sane
      CHECK (
        (full_day_hours IS NULL OR (full_day_hours > 0 AND full_day_hours <= 24))
        AND (half_day_hours IS NULL OR (half_day_hours > 0 AND half_day_hours <= 24))
        -- A half threshold at or above the full one makes "half day" unreachable, which is a
        -- setting that silently does nothing. Rejected here as well as in resolveShiftThresholds.
        AND (full_day_hours IS NULL OR half_day_hours IS NULL OR half_day_hours < full_day_hours)
      );
  END IF;
END $$;

-- Finding a tenant's terminals, and a device's roster, are both estate-scoped reads.
CREATE INDEX IF NOT EXISTS idx_biometric_devices_tenant_estate
  ON biometric_devices (tenant_id, estate);

DO $$
DECLARE
  bad INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad FROM tenants
  WHERE (full_day_hours IS NOT NULL AND (full_day_hours <= 0 OR full_day_hours > 24))
     OR (half_day_hours IS NOT NULL AND (half_day_hours <= 0 OR half_day_hours > 24))
     OR (full_day_hours IS NOT NULL AND half_day_hours IS NOT NULL AND half_day_hours >= full_day_hours);
  IF bad > 0 THEN
    RAISE EXCEPTION '143: % tenant(s) hold shift hours the constraint now rejects', bad;
  END IF;
END $$;
