-- Fix inventory trigger to work with tenant-aware, location-aware inventory
DROP TRIGGER IF EXISTS transaction_trigger ON transaction_history;
DROP FUNCTION IF EXISTS update_inventory();

CREATE OR REPLACE FUNCTION update_inventory()
RETURNS TRIGGER AS $$
DECLARE
    is_restock BOOLEAN;
    current_unit TEXT;
BEGIN
    is_restock := NEW.transaction_type IN ('Restocking', 'restock');

    SELECT unit
      INTO current_unit
      FROM current_inventory
     WHERE item_type = NEW.item_type
       AND tenant_id = NEW.tenant_id
       AND location_id IS NOT DISTINCT FROM NEW.location_id
     LIMIT 1;

    IF NEW.location_id IS NULL THEN
        INSERT INTO current_inventory (item_type, quantity, total_cost, avg_price, unit, tenant_id, location_id)
        VALUES (
            NEW.item_type,
            CASE
                WHEN is_restock THEN NEW.quantity
                ELSE -NEW.quantity
            END,
            CASE
                WHEN is_restock THEN NEW.total_cost
                ELSE 0
            END,
            CASE
                WHEN is_restock AND NEW.quantity > 0
                THEN NEW.total_cost / NEW.quantity
                ELSE 0
            END,
            COALESCE(current_unit, 'kg'),
            NEW.tenant_id,
            NULL
        )
        ON CONFLICT (item_type, tenant_id) WHERE location_id IS NULL
        DO UPDATE SET
            quantity = current_inventory.quantity +
                CASE
                    WHEN is_restock THEN NEW.quantity
                    ELSE -NEW.quantity
                END,
            total_cost = GREATEST(0, current_inventory.total_cost +
                CASE
                    WHEN is_restock THEN NEW.total_cost
                    ELSE -(NEW.quantity * CASE
                        WHEN current_inventory.quantity > 0 THEN current_inventory.total_cost / current_inventory.quantity
                        ELSE 0
                    END)
                END),
            avg_price = CASE
                WHEN (current_inventory.quantity +
                    CASE
                        WHEN is_restock THEN NEW.quantity
                        ELSE -NEW.quantity
                    END) > 0
                THEN (GREATEST(0, current_inventory.total_cost +
                    CASE
                        WHEN is_restock THEN NEW.total_cost
                        ELSE -(NEW.quantity * CASE
                            WHEN current_inventory.quantity > 0 THEN current_inventory.total_cost / current_inventory.quantity
                            ELSE 0
                        END)
                    END)) / (current_inventory.quantity +
                    CASE
                        WHEN is_restock THEN NEW.quantity
                        ELSE -NEW.quantity
                    END)
                ELSE 0
            END;
    ELSE
        INSERT INTO current_inventory (item_type, quantity, total_cost, avg_price, unit, tenant_id, location_id)
        VALUES (
            NEW.item_type,
            CASE
                WHEN is_restock THEN NEW.quantity
                ELSE -NEW.quantity
            END,
            CASE
                WHEN is_restock THEN NEW.total_cost
                ELSE 0
            END,
            CASE
                WHEN is_restock AND NEW.quantity > 0
                THEN NEW.total_cost / NEW.quantity
                ELSE 0
            END,
            COALESCE(current_unit, 'kg'),
            NEW.tenant_id,
            NEW.location_id
        )
        ON CONFLICT (item_type, tenant_id, location_id)
        DO UPDATE SET
            quantity = current_inventory.quantity +
                CASE
                    WHEN is_restock THEN NEW.quantity
                    ELSE -NEW.quantity
                END,
            total_cost = GREATEST(0, current_inventory.total_cost +
                CASE
                    WHEN is_restock THEN NEW.total_cost
                    ELSE -(NEW.quantity * CASE
                        WHEN current_inventory.quantity > 0 THEN current_inventory.total_cost / current_inventory.quantity
                        ELSE 0
                    END)
                END),
            avg_price = CASE
                WHEN (current_inventory.quantity +
                    CASE
                        WHEN is_restock THEN NEW.quantity
                        ELSE -NEW.quantity
                    END) > 0
                THEN (GREATEST(0, current_inventory.total_cost +
                    CASE
                        WHEN is_restock THEN NEW.total_cost
                        ELSE -(NEW.quantity * CASE
                            WHEN current_inventory.quantity > 0 THEN current_inventory.total_cost / current_inventory.quantity
                            ELSE 0
                        END)
                    END)) / (current_inventory.quantity +
                    CASE
                        WHEN is_restock THEN NEW.quantity
                        ELSE -NEW.quantity
                    END)
                ELSE 0
            END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transaction_trigger
    AFTER INSERT ON transaction_history
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory();
