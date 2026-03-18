-- Fix update_inventory trigger: match inventory slots by normalized item name.
-- Legacy rows can carry trailing spaces or whitespace/case drift, which makes
-- exact item_type comparisons fail even when stock exists in the selected slot.

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
      ON CONFLICT (item_type, tenant_id, location_id)
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
