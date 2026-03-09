-- Fix update_inventory trigger: avoid negative INSERT rows on deplete.
-- The previous implementation inserted a negative quantity before conflict update,
-- which can trip check_non_negative_quantity before ON CONFLICT executes.

CREATE OR REPLACE FUNCTION public.update_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  is_restock BOOLEAN;
  resolved_unit TEXT;
BEGIN
  is_restock := LOWER(COALESCE(NEW.transaction_type, '')) IN ('restock', 'restocking');
  resolved_unit := COALESCE(NULLIF(BTRIM(COALESCE(NEW.unit, '')), ''), 'kg');

  IF is_restock THEN
    IF NEW.location_id IS NULL THEN
      INSERT INTO public.current_inventory (item_type, quantity, total_cost, avg_price, unit, tenant_id, location_id)
      VALUES (
        NEW.item_type,
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
        NEW.item_type,
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
    AND ci.item_type = NEW.item_type
    AND ci.location_id IS NOT DISTINCT FROM NEW.location_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock for % at selected location', NEW.item_type
      USING ERRCODE = '23514', CONSTRAINT = 'check_non_negative_quantity';
  END IF;

  RETURN NEW;
END;
$function$;
