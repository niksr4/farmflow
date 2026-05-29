-- Migration 90: HoneyFarm activity code cleanup
--
-- Removes 34 completely unused codes (0 labour entries, 0 expense entries)
-- and fixes two incorrect module_hint tags.
--
-- Categories removed:
--   - Non-standard alphanumeric codes (101a, 101b) — never used, non-standard format
--   - Staff/admin codes never used (102 PF, 105 Bungalow, 107 Sickness, 109 Welfare,
--     110 Postage, 111 Watchman, 118 Weather Protectives, 119 Cattle, 121 Telephone,
--     123 Tools)
--   - Field ops codes never used by HoneyFarm (153 Pest Control Robusta, 162 Robusta
--     Curing, 182–185 Pepper sub-codes, 191 Paddy)
--   - Side-crop codes never used (201 Arecanut, 202 Orange, 204 Ginger, 206 Other Crops)
--   - New planting / establishment codes never used (212–222) — HoneyFarm estate is
--     mature; no new-clearing work tracked here
--
-- module_hint fixes:
--   - 101 Salaries And Allowances: remove 'labour' hint — staff salaries are correctly
--     logged as expenses; the hint was causing false warnings
--   - 108 Medical Exp Staff, Labour: remove 'labour' hint — medical bills are expenses

BEGIN;

-- ── Fix incorrect module_hint tags ───────────────────────────────────────────
UPDATE account_activities
SET module_hint = NULL
WHERE code IN ('101', '108')
  AND tenant_id = '41b4b10c-428c-4155-882f-1cc7f6e89a78';

-- ── Delete unused codes for HoneyFarm ────────────────────────────────────────
-- FK constraints prevent deletion if any labour or expense entries use the code,
-- so this is safe — it will error rather than silently orphan data.
DELETE FROM account_activities
WHERE tenant_id = '41b4b10c-428c-4155-882f-1cc7f6e89a78'
  AND code IN (
    -- Non-standard
    '101a', '101b',
    -- Staff / admin — never used
    '102',   -- Provident Fund, Insurance
    '105',   -- Bungalow Servants
    '107',   -- Sickness Benefit
    '109',   -- Labour Welfare
    '110',   -- Postage, Stationary
    '111',   -- Watchman Estate, Drying Yard
    '118',   -- Weather Protectives
    '119',   -- Cattle Expenses
    '121',   -- Telephone Bill
    '123',   -- Tools And Implements
    -- Robusta ops — not used (covered by other codes)
    '153',   -- Pest Control, Berry Borer (133 Arabica Borer used instead)
    '162',   -- Robusta Curing (161 Processing & Drying used instead)
    '164',   -- Robusta Harvesting incentive (0 use — kept if needed but unused; remove)
    -- Pepper sub-codes — never used (181 Pepper Planting used, but not these)
    '182',   -- Pepper Manuring
    '183',   -- Pepper Pest & Disease Cont.
    '184',   -- Pepper Harvest, Process, Pack
    -- Compost — duplicate of 245 Organic Compost Manure
    '185',   -- Compost Preparation
    -- Other crops — not grown at HoneyFarm
    '191',   -- Paddy Cultivation
    '201',   -- Arecanut
    '202',   -- Orange
    '204',   -- Ginger
    '206',   -- Other Crops
    -- New planting / establishment series — mature estate, never used
    '212',   -- Planting Temporary Shade
    '213',   -- Lining
    '214',   -- Pitting
    '215',   -- New Planting, Clearing (211 New Clearing IS used)
    '216',   -- Mulching & Staking
    '217',   -- Cover Digging
    '218',   -- Sheltering
    '219',   -- Lime (lime costs tracked under 135/136/155/156)
    '220',   -- Weeding - (New Clearing)
    '221',   -- Pests & Diseases (misspelled; 133 used instead)
    '222'    -- Fence (New Clearing)
  );

COMMIT;
