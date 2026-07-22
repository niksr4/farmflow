-- Migration 100: Restore the full 80-code default activity list for HoneyFarm
--
-- Migration 90 deleted 34 "unused" codes for HoneyFarm (102 Provident Fund,
-- 105 Bungalow Servants, 107 Sickness Benefit, etc.) but was only ever applied
-- to dev, not prod — so dev and prod have since drifted apart. The 80-code
-- default list in lib/account-activity-suggestions.ts was itself derived from
-- HoneyFarm's own setup, so this re-inserts every canonical code currently
-- missing for HoneyFarm in whichever environment it's run against.
--
-- ON CONFLICT DO NOTHING means this only fills gaps — it will not touch or
-- overwrite codes that already exist (e.g. prod's manually renamed 182/183).

BEGIN;

INSERT INTO account_activities (tenant_id, code, activity)
VALUES
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '101',  'Salaries And Allowances'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '101A', 'Writer Wage & Benefits'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '101B', 'Supervisor'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '102',  'Provident Fund, Insurance'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '103',  'Bonus Staff And Labour'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '104',  'Gratuity'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '105',  'Bungalow Servants'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '106',  'Leave With Wages'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '107',  'Sickness Benifit'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '108',  'Medical Exp Staff, Labour'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '109',  'Labour Welfare'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '110',  'Postage, Stationary'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '111',  'Watchman Estate, Drying Yard'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '112',  'Vehicle Running & Maint'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '113',  'Electricity'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '115',  'Machinary Maintenance'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '116',  'Land Tax'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '117',  'Maint Build, Roads, Yard'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '118',  'Weather Protectives'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '119',  'Cattle Expenses'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '120',  'Water Supply'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '121',  'Telephone Bill'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '122',  'Miscellaneous'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '123',  'Tools And Implements'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '131',  'Arabica Weeding, Trenching'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '132',  'Arabica Pruning, Handling'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '133',  'Arabica Borer Tracing'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '134',  'Arabica Shade Work'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '135',  'Arabica, Cost Lime, Manure'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '136',  'Arabica Lime, Manuring'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '137',  'Arabica Spraying'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '138',  'Arabica Fence'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '139',  'Arabica Supplies, Upkeep'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '140',  'Arabica Harvesting'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '141',  'Arabica Processing & Drying'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '143',  'Arabica Irrigation'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '144',  'Arabica Harvesting incentive'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '150',  'Drip line Maintenance'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '151',  'Robusta Weeding'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '152',  'Robusta Pruning, Handling'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '153',  'Pest Control, Berry Borer'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '154',  'Robusta Shade Temp, Perm.'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '155',  'Robusta, Cost Lime, Manure'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '156',  'Robusta Liming, Manuring'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '157',  'Robusta Spray'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '158',  'Robusta Fence Maint'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '159',  'Supplies Planting, Upkeep'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '160',  'Robust Harvesting'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '161',  'Robusta Processing & Drying'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '162',  'Robusta Curing'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '163',  'Robusta Irrigation'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '164',  'Robusta Harvesting incentive'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '181',  'Pepper Planting, Upkeep'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '182',  'Pepper Manuring'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '183',  'Pepper Pest & Disease Cont.'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '184',  'Pepper Havest, Process, Pack'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '185',  'Compost Preperation'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '191',  'Paddy Cultivation'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '200',  'arecanut composting'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '201',  'Arecanut'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '202',  'Orange'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '204',  'Ginger'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '206',  'Other Crops'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '210',  'Nursery'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '211',  'New Clearing'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '212',  'Planting Temporary Shade'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '213',  'Lining'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '214',  'Pitting'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '215',  'New Planting, Clearing'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '216',  'Mulching & Staking'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '217',  'Cover Digging'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '218',  'Sheltering'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '219',  'Lime'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '220',  'Weeding - (New Clearing)'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '221',  'Pests & Diseses'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '222',  'Fence (New Clearing)'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '232',  'Lent'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '233',  'Capital Account'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '245',  'Organic Compost Manure'),
  ('41b4b10c-428c-4155-882f-1cc7f6e89a78', '555',  'Solar Fence')
ON CONFLICT ON CONSTRAINT account_activities_tenant_code_unique DO NOTHING;

-- Restore the module_hint on 107 that migration 89 tagged before migration 90
-- deleted the row (dev only — prod never had this row deleted, so this is a
-- no-op there unless 107 also happens to be missing/untagged).
UPDATE account_activities
SET module_hint = 'labour'
WHERE tenant_id = '41b4b10c-428c-4155-882f-1cc7f6e89a78'
  AND code = '107'
  AND module_hint IS NULL;

COMMIT;
