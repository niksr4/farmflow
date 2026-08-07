-- Rubber support is removed from FarmFlow: no tenant has ever recorded a rubber_records
-- row (migration 85 is recorded as applied on prod but the table was never actually
-- created there — a silent migration-runner miss, unrelated to the numeric-sort bug
-- documented for scripts 100+). Two prod tenants had the module toggled on with nothing
-- behind it, so this cleans up the dangling state rather than leaving a tab that 500s.

DROP TABLE IF EXISTS rubber_records;

DELETE FROM tenant_modules WHERE module = 'rubber';
DELETE FROM user_modules WHERE module = 'rubber';
