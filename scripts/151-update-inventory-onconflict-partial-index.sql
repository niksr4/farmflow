-- 151: the restock upsert names a conflict target Postgres cannot match to any index.
--
-- THE DEFECT. update_inventory() ends its "restock into a location that has no slot yet" branch
-- with:
--
--     ON CONFLICT (item_type, tenant_id, location_id) DO UPDATE SET ...
--
-- There is no such index. The only unique index over those three columns is PARTIAL:
--
--     uq_current_inventory_item_tenant_location
--       ON current_inventory (item_type, tenant_id, location_id) WHERE location_id IS NOT NULL
--
-- and Postgres will not infer a partial index unless the statement REPEATS its predicate. So the
-- branch does not upsert; it raises 42P10, "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification", and the whole INSERT into transaction_history is rolled back.
-- Reproduced on dev 2026-09-11 with a plain restock into a store that had no slot for the item.
--
-- The NULL-location branch immediately above it is CORRECT -- it writes
-- `ON CONFLICT (item_type, tenant_id) WHERE location_id IS NULL` -- so the two branches of the
-- same IF disagree about a rule that applies to both. So does the application: the create-item
-- route in app/api/inventory-neon/route.ts has carried the predicate on both arms all along.
-- This is the one place that dropped it.
--
-- WHY NOBODY HAS SEEN IT. The app never reaches the failing branch. Creating an item runs a slot
-- upsert and the opening transaction inside one runTenantTransaction, so by the time the trigger
-- fires the slot exists and the match at the top of the function finds it -- the UPDATE path, not
-- the INSERT path. Every restock afterwards matches too. The broken branch is reachable only by
-- something that writes transaction_history directly: an import, a ledger rebuild
-- (scripts/104-honeyfarm-ledger-reset.sql), scripts/dev/refresh-laxmi-from-prod.mjs, a psql
-- session, or a future route that forgets the dance.
--
-- It is also the concurrency path. Two simultaneous first-restocks of the same item race: one
-- creates the slot, the other finds no match, falls into this branch, and gets 42P10 rather than
-- the merge the ON CONFLICT was written to perform. ON CONFLICT exists FOR that race, and here it
-- has never once been able to handle it.
--
-- Same shape as 56-fix-processing-recompute-trigger-recursion.sql: a function that reads correctly,
-- is recorded as applied, and has a path that cannot work. The difference is that processing hit
-- its path on every insert and was dead for seven months; this one is held out of reach by a
-- convention in the calling code. A convention is not a constraint.
--
-- MEDAPPA HAS TWO STORES on production, and all 59 inventory slots across all tenants carry a
-- non-null location_id -- so the NULL branch is now the dead one and the broken branch is the
-- only live path for a first restock into a store.
--
-- THE FIX IS THE PREDICATE, NOT THE INDEX. Making uq_current_inventory_item_tenant_location total
-- would also satisfy the inference, but it would then collide with
-- uq_current_inventory_item_tenant_null_location over the NULL rows and change what "one slot per
-- item" means. Repeating the predicate is what the rest of the codebase already does.
--
-- Everything else in this function is unchanged from 59.

CREATE OR REPLACE FUNCTION public.update_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  is_restock BOOLEAN;
  resolved_unit TEXT;
  normalized_item_type TEXT;
  canonical_item_type TEXT;
  matched_item_type TEXT;
  matched_inventory_quantity NUMERIC;
BEGIN
  is_restock := LOWER(COALESCE(NEW.transaction_type, '')) IN ('restock', 'restocking');
  resolved_unit := COALESCE(NULLIF(BTRIM(COALESCE(NEW.unit, '')), ''), 'kg');
  normalized_item_type := REGEXP_REPLACE(BTRIM(COALESCE(NEW.item_type, '')), '\s+', ' ', 'g');
  canonical_item_type := normalized_item_type;

  SELECT ci.item_type, COALESCE(ci.quantity, 0)
  INTO matched_item_type, matched_inventory_quantity
  FROM public.current_inventory ci
  WHERE ci.tenant_id = NEW.tenant_id
    AND LOWER(REGEXP_REPLACE(BTRIM(ci.item_type), '\s+', ' ', 'g')) = LOWER(normalized_item_type)
    AND ci.location_id IS NOT DISTINCT FROM NEW.location_id
  ORDER BY
    CASE
      WHEN ci.item_type = NEW.item_type THEN 0
      WHEN BTRIM(ci.item_type) = normalized_item_type THEN 1
      ELSE 2
    END,
    ci.item_type ASC
  LIMIT 1
  FOR UPDATE;

  canonical_item_type := COALESCE(matched_item_type, canonical_item_type);

  IF canonical_item_type IS NULL OR canonical_item_type = '' THEN
    SELECT ci.item_type
    INTO canonical_item_type
    FROM public.current_inventory ci
    WHERE ci.tenant_id = NEW.tenant_id
      AND LOWER(REGEXP_REPLACE(BTRIM(ci.item_type), '\s+', ' ', 'g')) = LOWER(normalized_item_type)
    ORDER BY
      CASE
        WHEN ci.item_type = NEW.item_type THEN 0
        WHEN BTRIM(ci.item_type) = normalized_item_type THEN 1
        ELSE 2
      END,
      ci.item_type ASC
    LIMIT 1;

    canonical_item_type := COALESCE(canonical_item_type, normalized_item_type);
  END IF;

  IF is_restock THEN
    IF matched_item_type IS NOT NULL THEN
      UPDATE public.current_inventory ci
      SET
        quantity = ci.quantity + NEW.quantity,
        total_cost = GREATEST(0, ci.total_cost + NEW.total_cost),
        avg_price = CASE
          WHEN (ci.quantity + NEW.quantity) > 0
          THEN GREATEST(0, ci.total_cost + NEW.total_cost) / (ci.quantity + NEW.quantity)
          ELSE 0
        END,
        unit = COALESCE(NULLIF(BTRIM(resolved_unit), ''), ci.unit, 'kg')
      WHERE ci.tenant_id = NEW.tenant_id
        AND ci.item_type = matched_item_type
        AND ci.location_id IS NOT DISTINCT FROM NEW.location_id;
    ELSIF NEW.location_id IS NULL THEN
      INSERT INTO public.current_inventory (item_type, quantity, total_cost, avg_price, unit, tenant_id, location_id)
      VALUES (
        canonical_item_type,
        NEW.quantity,
        NEW.total_cost,
        CASE WHEN NEW.quantity > 0 THEN NEW.total_cost / NEW.quantity ELSE 0 END,
        resolved_unit,
        NEW.tenant_id,
        NULL
      )
      ON CONFLICT (item_type, tenant_id) WHERE location_id IS NULL
      DO UPDATE SET
        quantity = public.current_inventory.quantity + EXCLUDED.quantity,
        total_cost = GREATEST(0, public.current_inventory.total_cost + EXCLUDED.total_cost),
        avg_price = CASE
          WHEN (public.current_inventory.quantity + EXCLUDED.quantity) > 0
          THEN GREATEST(0, public.current_inventory.total_cost + EXCLUDED.total_cost)
               / (public.current_inventory.quantity + EXCLUDED.quantity)
          ELSE 0
        END,
        unit = COALESCE(NULLIF(BTRIM(EXCLUDED.unit), ''), public.current_inventory.unit, 'kg');
    ELSE
      INSERT INTO public.current_inventory (item_type, quantity, total_cost, avg_price, unit, tenant_id, location_id)
      VALUES (
        canonical_item_type,
        NEW.quantity,
        NEW.total_cost,
        CASE WHEN NEW.quantity > 0 THEN NEW.total_cost / NEW.quantity ELSE 0 END,
        resolved_unit,
        NEW.tenant_id,
        NEW.location_id
      )
      -- WHERE location_id IS NOT NULL is what makes this statement work at all. Without it
      -- Postgres cannot see uq_current_inventory_item_tenant_location and raises 42P10.
      ON CONFLICT (item_type, tenant_id, location_id) WHERE location_id IS NOT NULL
      DO UPDATE SET
        quantity = public.current_inventory.quantity + EXCLUDED.quantity,
        total_cost = GREATEST(0, public.current_inventory.total_cost + EXCLUDED.total_cost),
        avg_price = CASE
          WHEN (public.current_inventory.quantity + EXCLUDED.quantity) > 0
          THEN GREATEST(0, public.current_inventory.total_cost + EXCLUDED.total_cost)
               / (public.current_inventory.quantity + EXCLUDED.quantity)
          ELSE 0
        END,
        unit = COALESCE(NULLIF(BTRIM(EXCLUDED.unit), ''), public.current_inventory.unit, 'kg');
    END IF;

    RETURN NEW;
  END IF;

  IF matched_item_type IS NULL OR matched_inventory_quantity + 0.0001 < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient stock for % at selected location', NEW.item_type
      USING ERRCODE = '23514', CONSTRAINT = 'check_non_negative_quantity';
  END IF;

  UPDATE public.current_inventory ci
  SET
    quantity = ci.quantity - NEW.quantity,
    total_cost = GREATEST(
      0,
      ci.total_cost - (
        NEW.quantity * CASE
          WHEN ci.quantity > 0 THEN ci.total_cost / ci.quantity
          ELSE 0
        END
      )
    ),
    avg_price = CASE
      WHEN (ci.quantity - NEW.quantity) > 0 THEN
        GREATEST(
          0,
          ci.total_cost - (
            NEW.quantity * CASE
              WHEN ci.quantity > 0 THEN ci.total_cost / ci.quantity
              ELSE 0
            END
          )
        ) / (ci.quantity - NEW.quantity)
      ELSE 0
    END,
    unit = COALESCE(NULLIF(BTRIM(ci.unit), ''), resolved_unit)
  WHERE ci.tenant_id = NEW.tenant_id
    AND ci.item_type = matched_item_type
    AND ci.location_id IS NOT DISTINCT FROM NEW.location_id;

  RETURN NEW;
END;
$function$;
