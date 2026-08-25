-- 141: what a salaried worker is paid a month, which is not a daily rate.
--
-- `daily_rate` answers "what does a day of this person's time cost". For staff there is no answer:
-- they are paid the same whether they work eighteen days or twenty-four, and dividing the salary by
-- days worked invents a rate that changes every month and matches no payslip.
--
-- Storing the salary in daily_rate would have been the cheap move and the wrong one. Every consumer
-- of that column multiplies it by days -- the muster, payroll, labour_cost -- so a Rs 16,000 salary
-- sitting there becomes Rs 16,000 x 22 the moment anyone is marked present.
--
-- HoneyFarm has two staff and a proprietor; Laxmi's Rs 21,29,850 of salaries and bonuses is 80% of
-- their labour and currently has nowhere to live at all. This is the column that lets the second
-- half of that -- generating the charge on the last day of the month -- be built without guessing
-- the amount.
--
-- NULLABLE, and expected to be null for almost everyone. A worker paid by the day has no monthly
-- wage, and a default of zero would read as "salaried, earns nothing".

ALTER TABLE attendance_workers
  ADD COLUMN IF NOT EXISTS monthly_wage NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_workers_monthly_wage_positive') THEN
    ALTER TABLE attendance_workers
      ADD CONSTRAINT attendance_workers_monthly_wage_positive
      CHECK (monthly_wage IS NULL OR monthly_wage > 0);
  END IF;
END $$;

-- A worker cannot be paid both ways for the same time. Nothing today writes both, and this is
-- cheaper to enforce now than to reconcile once two tenants have done it differently.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_workers_one_pay_basis') THEN
    ALTER TABLE attendance_workers
      ADD CONSTRAINT attendance_workers_one_pay_basis
      CHECK (monthly_wage IS NULL OR COALESCE(daily_rate, 0) = 0);
  END IF;
END $$;

DO $$
DECLARE
  -- Not named `both`: that is a reserved word in Postgres (TRIM(BOTH ...)) and the parser fails
  -- on the DECLARE with a message that names the variable rather than the reason.
  conflicting INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflicting
  FROM attendance_workers
  WHERE monthly_wage IS NOT NULL AND COALESCE(daily_rate, 0) > 0;

  IF conflicting > 0 THEN
    RAISE EXCEPTION '141: % worker(s) carry both a monthly wage and a daily rate', conflicting;
  END IF;
END $$;
