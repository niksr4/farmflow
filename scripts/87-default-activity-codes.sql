-- Migration 87: Scope account_activities uniqueness to (tenant_id, code)
-- and seed the 91 default codes for any tenant that has none.

DO $$
BEGIN
  -- Drop global UNIQUE on code (prevents two tenants sharing the same code number)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_activities_code_key'
      AND conrelid = 'account_activities'::regclass
  ) THEN
    ALTER TABLE account_activities DROP CONSTRAINT account_activities_code_key;
  END IF;

  -- Drop legacy FK on labor_deployments → account_activities(code)
  IF to_regclass('labor_deployments') IS NOT NULL THEN
    DECLARE v_conname text;
    BEGIN
      SELECT conname INTO v_conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'labor_deployments' AND c.contype = 'f'
        AND EXISTS (
          SELECT 1 FROM pg_attribute a
          JOIN pg_constraint ac ON a.attrelid = ac.conrelid AND a.attnum = ANY(ac.conkey)
          WHERE ac.oid = c.oid AND a.attname = 'code'
        )
      LIMIT 1;
      IF v_conname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE labor_deployments DROP CONSTRAINT ' || quote_ident(v_conname);
      END IF;
    END;
  END IF;

  -- Drop legacy FK on other_expenses → account_activities(code)
  IF to_regclass('other_expenses') IS NOT NULL THEN
    DECLARE v_conname text;
    BEGIN
      SELECT conname INTO v_conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'other_expenses' AND c.contype = 'f'
        AND EXISTS (
          SELECT 1 FROM pg_attribute a
          JOIN pg_constraint ac ON a.attrelid = ac.conrelid AND a.attnum = ANY(ac.conkey)
          WHERE ac.oid = c.oid AND a.attname = 'code'
        )
      LIMIT 1;
      IF v_conname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE other_expenses DROP CONSTRAINT ' || quote_ident(v_conname);
      END IF;
    END;
  END IF;

  -- Add composite unique constraint (tenant_id, code)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_activities_tenant_code_unique'
      AND conrelid = 'account_activities'::regclass
  ) THEN
    ALTER TABLE account_activities
      ADD CONSTRAINT account_activities_tenant_code_unique UNIQUE (tenant_id, code);
  END IF;
END $$;

-- Seed default codes for any tenant that currently has zero activity codes.
-- ON CONFLICT ensures we never touch tenants who have already customised their list.
INSERT INTO account_activities (tenant_id, code, activity)
SELECT t.id, d.code, d.activity
FROM tenants t
CROSS JOIN (VALUES
  ('101',  'Salaries And Allowances'),
  ('101A', 'Writer Wage & Benefits'),
  ('101B', 'Supervisor'),
  ('102',  'Provident Fund, Insurance'),
  ('103',  'Bonus Staff And Labour'),
  ('104',  'Gratuity'),
  ('105',  'Bungalow Servants'),
  ('106',  'Leave With Wages'),
  ('107',  'Sickness Benifit'),
  ('108',  'Medical Exp Staff, Labour'),
  ('109',  'Labour Welfare'),
  ('110',  'Postage, Stationary'),
  ('111',  'Watchman Estate, Drying Yard'),
  ('112',  'Vehicle Running & Maint'),
  ('113',  'Electricity'),
  ('115',  'Machinary Maintenance'),
  ('116',  'Land Tax'),
  ('117',  'Maint Build, Roads, Yard'),
  ('118',  'Weather Protectives'),
  ('119',  'Cattle Expenses'),
  ('120',  'Water Supply'),
  ('121',  'Telephone Bill'),
  ('122',  'Miscellaneous'),
  ('123',  'Tools And Implements'),
  ('131',  'Arabica Weeding, Trenching'),
  ('132',  'Arabica Pruning, Handling'),
  ('133',  'Arabica Borer Tracing'),
  ('134',  'Arabica Shade Work'),
  ('135',  'Arabica, Cost Lime, Manure'),
  ('136',  'Arabica Lime, Manuring'),
  ('137',  'Arabica Spraying'),
  ('138',  'Arabica Fence'),
  ('139',  'Arabica Supplies, Upkeep'),
  ('140',  'Arabica Harvesting'),
  ('141',  'Arabica Processing & Drying'),
  ('143',  'Arabica Irrigation'),
  ('144',  'Arabica Harvesting incentive'),
  ('150',  'Drip line Maintenance'),
  ('151',  'Robusta Weeding'),
  ('152',  'Robusta Pruning, Handling'),
  ('153',  'Pest Control, Berry Borer'),
  ('154',  'Robusta Shade Temp, Perm.'),
  ('155',  'Robusta, Cost Lime, Manure'),
  ('156',  'Robusta Liming, Manuring'),
  ('157',  'Robusta Spray'),
  ('158',  'Robusta Fence Maint'),
  ('159',  'Supplies Planting, Upkeep'),
  ('160',  'Robust Harvesting'),
  ('161',  'Robusta Processing & Drying'),
  ('162',  'Robusta Curing'),
  ('163',  'Robusta Irrigation'),
  ('164',  'Robusta Harvesting incentive'),
  ('181',  'Pepper Planting, Upkeep'),
  ('182',  'Pepper Manuring'),
  ('183',  'Pepper Pest & Disease Cont.'),
  ('184',  'Pepper Havest, Process, Pack'),
  ('185',  'Compost Preperation'),
  ('191',  'Paddy Cultivation'),
  ('200',  'arecanut composting'),
  ('201',  'Arecanut'),
  ('202',  'Orange'),
  ('204',  'Ginger'),
  ('206',  'Other Crops'),
  ('210',  'Nursery'),
  ('211',  'New Clearing'),
  ('212',  'Planting Temporary Shade'),
  ('213',  'Lining'),
  ('214',  'Pitting'),
  ('215',  'New Planting, Clearing'),
  ('216',  'Mulching & Staking'),
  ('217',  'Cover Digging'),
  ('218',  'Sheltering'),
  ('219',  'Lime'),
  ('220',  'Weeding - (New Clearing)'),
  ('221',  'Pests & Diseses'),
  ('222',  'Fence (New Clearing)'),
  ('232',  'Lent'),
  ('233',  'Capital Account'),
  ('245',  'Organic Compost Manure'),
  ('555',  'Solar Fence')
) AS d(code, activity)
WHERE NOT EXISTS (
  SELECT 1 FROM account_activities aa WHERE aa.tenant_id = t.id LIMIT 1
)
ON CONFLICT ON CONSTRAINT account_activities_tenant_code_unique DO NOTHING;
