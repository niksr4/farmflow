-- 149: the rules an estate sets about a person's pay, and the shape of a recoverable advance.
--
-- From the Medappa call, 2026-09-08. Written to hold every reading of what they asked for, because
-- the answers had not arrived when this was built and because the next estate will answer
-- differently. See docs/MEDAPPA-PAYROLL-PROPOSAL.md for the eleven ambiguities this is scoped
-- against, and docs/PAYROLL-RULES-PLAN.md for why none of it is settled by a person ticking a box.
--
-- NOTHING HERE IS KEYED TO A TENANT. Every rule is a row an estate writes for itself, the same
-- answer the muster gave twice already: activity codes are per-tenant data, worker types are
-- per-tenant data. Nobody's rules live in a switch statement, which is what stops five customers
-- becoming five products.
--
-- An estate that writes no rows sees no change. That is the whole compatibility story: HoneyFarm,
-- Laxmi and Seshagiri have nothing here and their payroll is byte-identical afterwards.

-- ---------------------------------------------------------------------------
-- worker_pay_rules
-- ---------------------------------------------------------------------------
--
-- EFFECTIVE-DATED, AND THAT IS THE LOAD-BEARING DECISION.
--
-- Changing a rule INSERTS a row; it never updates one. Derivation for a work date picks the row
-- with the greatest effective_from on or before it. So raising retention from 20% to 25% in
-- October leaves September computing at 20% forever, and a payslip printed in June still matches
-- the screen in December.
--
-- The alternative -- one mutable rule per worker -- means every past payroll silently recomputes
-- the moment somebody edits a percentage. The only other way to avoid that is to have payroll
-- WRITE its results, which costs it the read-only property it has today
-- (tests/payroll-sources-are-reachable.test.ts asserts payroll writes nothing) and needs a
-- close-the-period action nobody asked for. Dating the rule is cheaper and stronger.

CREATE TABLE IF NOT EXISTS worker_pay_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- NULL = the estate-wide default. A row with a worker_id overrides it for that person only.
  -- Medappa set 20% once rather than twenty-nine times; "everyone except two" costs two rows.
  worker_id      UUID NULL REFERENCES attendance_workers(id) ON DELETE CASCADE,

  effective_from DATE NOT NULL,

  -- RETENTION. Both readings of "20%" are storable because the estate had not chosen yet:
  --   percent_of_day -- 20% of whatever that day paid. Follows a rate change on its own, and a
  --                     half day retains half without anybody deciding that separately.
  --   flat_per_day   -- a fixed rupee figure per day worked, unchanged until the estate changes it.
  -- They are identical on Medappa's flat Rs 600 roster and diverge the moment one rate moves,
  -- which is exactly why guessing was refused.
  retention_mode  TEXT NULL CHECK (retention_mode IN ('percent_of_day', 'flat_per_day')),
  retention_value NUMERIC(12,4) NULL CHECK (retention_value IS NULL OR retention_value >= 0),

  -- OVERTIME. Three readings of "1.2x the daily rate", differing by 3x on the same input:
  --   multiplier_of_hourly -- day rate / full_day_hours, times the multiplier, times hours worked.
  --                           Rs 600 over 6 hours at 1.2 = Rs 120/hour; 2 hours = Rs 240.
  --   multiplier_of_day    -- the whole day's wage times the multiplier, regardless of hours. This
  --                           is what labour_assignments.pay_multiplier ALREADY does (holiday pay:
  --                           "doubles the money for one day's work; it does not lengthen the day").
  --                           Stored here so the estate's intent is recorded even when the
  --                           arithmetic lands on the existing column.
  --   explicit_hourly      -- a rupee figure per hour the estate sets outright, ignoring the day rate.
  overtime_mode   TEXT NULL CHECK (overtime_mode IN ('multiplier_of_hourly', 'multiplier_of_day', 'explicit_hourly')),
  overtime_value  NUMERIC(12,4) NULL CHECK (overtime_value IS NULL OR overtime_value >= 0),

  -- How long a full day is, for the hourly derivation above. NULL falls back to the application
  -- default in lib/attendance-hours.ts (6 hours). This is NOT cosmetic: Rs 600 over 6 hours is
  -- Rs 100/hour and over 8 hours is Rs 75, a third less on every overtime payment ever made.
  full_day_hours  NUMERIC(5,2) NULL CHECK (full_day_hours IS NULL OR (full_day_hours > 0 AND full_day_hours <= 24)),

  -- Deferred by Medappa (they do not pay it) and unasked for by anyone else. Here because it is
  -- the same shape as the others and adding a column later means another migration.
  pf_percent      NUMERIC(6,3) NULL CHECK (pf_percent IS NULL OR (pf_percent >= 0 AND pf_percent <= 100)),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT NULL,

  -- A mode with no number cannot be applied, and a number with no mode does not say what it means.
  -- Either both or neither, per rule. All-NULL is deliberately legal -- see the note below.
  CONSTRAINT worker_pay_rules_retention_pair CHECK (
    (retention_mode IS NULL) = (retention_value IS NULL)
  ),
  CONSTRAINT worker_pay_rules_overtime_pair CHECK (
    (overtime_mode IS NULL) = (overtime_value IS NULL)
  )
);

-- AN ALL-NULL ROW IS NOT A MISTAKE, IT IS HOW YOU STOP.
--
-- "Retention ends on 1 April" is expressed as a rule row dated 1 April with retention_mode NULL.
-- Deleting the old row instead would rewrite history and un-retain money already held. There is
-- therefore no CHECK requiring at least one rule to be set, and that is on purpose.

COMMENT ON TABLE worker_pay_rules IS
  'Effective-dated pay rules. A change inserts a row; it never updates one, so past payroll stays reproducible. worker_id NULL = estate default. All-NULL rule columns = rules stop from that date.';

-- One rule per subject per date. worker_id is nullable and NULLs are never equal to each other, so
-- a single unique constraint would silently permit unlimited duplicate estate defaults on the same
-- date -- a real trap, and the same one scripts/146 hit on rainfall. Two partial indexes instead.
CREATE UNIQUE INDEX IF NOT EXISTS worker_pay_rules_worker_date_uniq
  ON worker_pay_rules (tenant_id, worker_id, effective_from)
  WHERE worker_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS worker_pay_rules_default_date_uniq
  ON worker_pay_rules (tenant_id, effective_from)
  WHERE worker_id IS NULL;

-- The lookup every payroll run makes: newest rule on or before a work date.
CREATE INDEX IF NOT EXISTS worker_pay_rules_lookup
  ON worker_pay_rules (tenant_id, worker_id, effective_from DESC);

-- ---------------------------------------------------------------------------
-- worker_ledger: an advance that recovers itself
-- ---------------------------------------------------------------------------
--
-- Confirmed on the call: an advance is recovered by instalments, not in one go. "Rs 20,000, and if
-- he earns about Rs 10,000 a month he gets Rs 8,000 for ten months."
--
-- The schedule lives on the entry, NOT as workflow state somebody has to close. An advance with
-- recover_over_periods = 5 produces an instalment in each of five periods and then stops, because
-- the sixth period is outside its own window. Nothing to tick, nothing to remember, and re-running
-- a closed month gives the same answer forever.
--
-- DEFAULT 1 reproduces exactly today's behaviour -- recovered in full within its own period -- so
-- every row that already exists, and every simple advance anyone records later, is unaffected.

ALTER TABLE worker_ledger
  ADD COLUMN IF NOT EXISTS recover_over_periods INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recover_from         DATE NULL,
  ADD COLUMN IF NOT EXISTS created_by           TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_ledger_recover_periods_check') THEN
    ALTER TABLE worker_ledger
      ADD CONSTRAINT worker_ledger_recover_periods_check CHECK (recover_over_periods >= 1);
  END IF;
END $$;

COMMENT ON COLUMN worker_ledger.recover_over_periods IS
  'Instalments this advance is recovered across. 1 = in full, in its own period (the historic behaviour).';
COMMENT ON COLUMN worker_ledger.recover_from IS
  'First period the recovery applies to. NULL = the period containing entry_date.';
COMMENT ON COLUMN worker_ledger.created_by IS
  'Who authorised it. Advances are admin-only; this is the record of which admin.';

-- Three more kinds of event. The existing three stay exactly as they are.
--
--   repayment         -- cash handed back early. An EVENT, not a flag: outstanding is advances
--                        minus instalments elapsed minus repayments, so there is never a balance
--                        anybody corrects by hand.
--   retention_accrual -- what a period held. Written when a period is settled, or derived; see the
--                        note in docs/PAYROLL-RULES-PLAN.md about which.
--   retention_payout  -- the settlement when a worker leaves. The one place the two balances net.
ALTER TABLE worker_ledger DROP CONSTRAINT IF EXISTS worker_ledger_entry_type_check;
ALTER TABLE worker_ledger ADD CONSTRAINT worker_ledger_entry_type_check
  CHECK (entry_type IN (
    'advance', 'deduction', 'adjustment',
    'repayment', 'retention_accrual', 'retention_payout'
  ));

CREATE INDEX IF NOT EXISTS worker_ledger_worker_date
  ON worker_ledger (tenant_id, worker_id, entry_date DESC);

-- ---------------------------------------------------------------------------
-- RLS, inline and not left to the sweep
-- ---------------------------------------------------------------------------
--
-- scripts/98 enables and forces RLS on every tenant_id table it can discover -- but it RAN ONCE, in
-- July. A table created afterwards is covered only by whoever remembers, which is precisely how the
-- module scaffold shipped a tenant table with no policy at all (caught by the QA scanner,
-- 2026-09-06). pnpm schema:rls would fail the build here eventually; this makes it correct from the
-- first row instead of from the next time somebody runs the checker.
--
-- Same policy text as 98, deliberately: an owner session bypasses, everyone else is confined to
-- their own tenant_id.

ALTER TABLE worker_pay_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_pay_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON worker_pay_rules;
CREATE POLICY tenant_isolation ON worker_pay_rules
  USING (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'owner'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

-- ---------------------------------------------------------------------------
-- Assertions. A migration that half-applied should say so here, not in a wage sheet.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY['recover_over_periods', 'recover_from', 'created_by']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'worker_ledger' AND column_name = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '149: worker_ledger is missing %', missing;
  END IF;

  -- This once asserted that NO worker_ledger row had recover_over_periods <> 1, to prove the
  -- column's default had not altered how existing rows recover.
  --
  -- It was right exactly once. The application supports schedules of 1 to 60 periods and the demo
  -- data creates a ten-period advance, so the moment any estate records a real multi-period advance
  -- this check fails on re-run — turning a correct database into a migration error and blocking
  -- every later migration behind it. The assertion could not tell "the default is wrong" from
  -- "somebody used the feature". Raised by Greptile, 2026-09-12.
  --
  -- The property it was defending is covered without the rerun hazard: the column is added with
  -- DEFAULT 1 NOT NULL above, so rows that predate it necessarily carry 1, and the CHECK constraint
  -- keeps every value >= 1.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'worker_ledger'
      AND column_name = 'recover_over_periods' AND column_default LIKE '%1%'
  ) THEN
    RAISE EXCEPTION '149: worker_ledger.recover_over_periods lost its default of 1';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.relname = 'worker_pay_rules' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION '149: worker_pay_rules is not RLS-enabled AND forced -- this is a cross-tenant leak';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'worker_pay_rules' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION '149: worker_pay_rules has RLS on with no policy, which denies everything';
  END IF;
END $$;

-- Nothing is seeded. An estate with no rules is an estate whose payroll is unchanged, and that is
-- true of all five tenants the moment this lands.
