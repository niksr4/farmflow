-- Optional: prevent writes to legacy tables after migration.
-- Run only after you confirm the app no longer writes to legacy tables.

CREATE OR REPLACE FUNCTION legacy_tables_readonly()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Legacy table % is read-only. Update normalized tables instead.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t_name TEXT;
  legacy_tables TEXT[] := ARRAY[
    'hf_arabica',
    'hf_robusta',
    'mv_robusta',
    'pg_robusta',
    'hf_pepper',
    'mv_pepper',
    'pg_pepper'
  ];
BEGIN
  FOREACH t_name IN ARRAY legacy_tables LOOP
    IF to_regclass(t_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I_readonly_trigger ON %I', t_name, t_name);
      EXECUTE format(
        'CREATE TRIGGER %I_readonly_trigger BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION legacy_tables_readonly()',
        t_name,
        t_name
      );
    END IF;
  END LOOP;
END $$;
