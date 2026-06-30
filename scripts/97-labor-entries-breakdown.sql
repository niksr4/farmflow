-- 97: labor_transactions.labor_entries — preserves the full original labor-group
-- breakdown (every group's name/laborCount/costPerLabor/contractTotal), not just
-- the in-house/outside summary columns.
--
-- Until now, any labor group beyond "In-house"/"Outside" (e.g. a custom "+Add
-- group" entry, or a lump-sum "Contract" entry) had its cost folded into
-- total_cost but its worker count and identity discarded entirely — there was
-- no column to put it in. That made total_cost silently drift ahead of what
-- hf_laborers + outside_laborers could ever reconstruct. This column lets new
-- entries keep the full picture so the transaction history can show the true
-- breakdown instead of a lossy two-bucket summary.

ALTER TABLE labor_transactions ADD COLUMN IF NOT EXISTS labor_entries JSONB;
