-- Drop legacy location-specific tables after confirming data is migrated.
-- Only run AFTER 23-normalize-processing.sql and after validating new tables.

DROP TABLE IF EXISTS hf_arabica;
DROP TABLE IF EXISTS hf_robusta;
DROP TABLE IF EXISTS mv_robusta;
DROP TABLE IF EXISTS pg_robusta;
DROP TABLE IF EXISTS hf_pepper;
DROP TABLE IF EXISTS mv_pepper;
DROP TABLE IF EXISTS pg_pepper;
