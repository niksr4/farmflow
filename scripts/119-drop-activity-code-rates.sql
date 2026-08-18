-- 119: work is not priced in advance. Undoes the default_rate added in 118.
--
-- WHY IT IS GOING. 118 let each activity code carry a rate, on the reasoning that the same person
-- is paid differently for shade lopping than for weeding. That is true, but it does not follow
-- that the difference is worth maintaining a rate table for: the exceptions vary by day, by gang
-- and by season, so a stored rate would be stale more often than right, and an estate would be
-- editing it as often as they would have simply typed the amount.
--
-- What is left is simpler and matches how estates actually pay. A worker has a daily wage. If a
-- day is worth something else, the amount is typed on that deployment. Two sources, one of them
-- almost always silent.
--
-- The column had reached dev only, never production, and nothing in the app reads it after this
-- change -- so this drops it rather than leaving dead schema behind for someone to find and
-- wonder about. labour_assignments.rate is untouched: every row still keeps its own copy of what
-- it was priced at, which is what makes history immune to any later change.

ALTER TABLE account_activities DROP COLUMN IF EXISTS default_rate;
