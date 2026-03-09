-- Prevent recursive processing recompute trigger loops (stack depth errors).
-- Safe to run multiple times.

CREATE OR REPLACE FUNCTION processing_records_recompute_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_id uuid;
  location_id uuid;
  coffee_type text;
BEGIN
  -- Recompute updates processing_records; this guard prevents trigger re-entry loops.
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  -- Optional session override for bulk backfills.
  IF COALESCE(current_setting('app.skip_processing_recompute', true), '') = '1' THEN
    RETURN NULL;
  END IF;

  tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);
  location_id := COALESCE(NEW.location_id, OLD.location_id);
  coffee_type := COALESCE(NEW.coffee_type, OLD.coffee_type);

  IF tenant_id IS NOT NULL AND location_id IS NOT NULL AND coffee_type IS NOT NULL THEN
    PERFORM recompute_processing_totals(tenant_id, location_id, coffee_type);
  END IF;

  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF to_regclass('processing_records') IS NULL THEN
    RAISE NOTICE 'processing_records table missing; skipped trigger recreation';
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS trg_processing_records_recompute ON processing_records;
  CREATE TRIGGER trg_processing_records_recompute
  AFTER INSERT OR UPDATE OR DELETE ON processing_records
  FOR EACH ROW
  EXECUTE FUNCTION processing_records_recompute_trigger();
END;
$$;
