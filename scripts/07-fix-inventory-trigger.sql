-- Drop the existing trigger and function with CASCADE
DROP TRIGGER IF EXISTS trigger_update_inventory ON transaction_history CASCADE;
DROP FUNCTION IF EXISTS update_inventory() CASCADE;

-- Create the improved trigger function that uses UPSERT
CREATE OR REPLACE FUNCTION update_inventory()
RETURNS TRIGGER AS $$
BEGIN
    -- Use INSERT ... ON CONFLICT (UPSERT) instead of plain INSERT
    INSERT INTO current_inventory (item_type, quantity, total_cost, avg_price, unit)
    VALUES (
        NEW.item_type,
        CASE 
            WHEN NEW.transaction_type IN ('Restocking', 'restock') THEN NEW.quantity 
            ELSE -NEW.quantity 
        END,
        CASE 
            WHEN NEW.transaction_type IN ('Restocking', 'restock') THEN NEW.total_cost 
            ELSE 0 
        END,
        CASE 
            WHEN NEW.transaction_type IN ('Restocking', 'restock') AND NEW.quantity > 0 
            THEN NEW.total_cost / NEW.quantity 
            ELSE 0 
        END,
        COALESCE((SELECT unit FROM current_inventory WHERE item_type = NEW.item_type), 'kg')
    )
    ON CONFLICT (item_type) 
    DO UPDATE SET
        quantity = current_inventory.quantity + 
            CASE 
                WHEN NEW.transaction_type IN ('Restocking', 'restock') THEN NEW.quantity 
                ELSE -NEW.quantity 
            END,
        total_cost = CASE
            WHEN NEW.transaction_type IN ('Restocking', 'restock') THEN
                current_inventory.total_cost + NEW.total_cost
            ELSE
                GREATEST(0, current_inventory.total_cost - (
                    CASE 
                        WHEN current_inventory.quantity > 0 
                        THEN (current_inventory.total_cost / current_inventory.quantity) * NEW.quantity
                        ELSE 0
                    END
                ))
        END,
        avg_price = CASE
            WHEN (current_inventory.quantity + 
                CASE 
                    WHEN NEW.transaction_type IN ('Restocking', 'restock') THEN NEW.quantity 
                    ELSE -NEW.quantity 
                END) > 0
            THEN (
                CASE
                    WHEN NEW.transaction_type IN ('Restocking', 'restock') THEN
                        current_inventory.total_cost + NEW.total_cost
                    ELSE
                        GREATEST(0, current_inventory.total_cost - (
                            CASE 
                                WHEN current_inventory.quantity > 0 
                                THEN (current_inventory.total_cost / current_inventory.quantity) * NEW.quantity
                                ELSE 0
                            END
                        ))
                END
            ) / (current_inventory.quantity + 
                CASE 
                    WHEN NEW.transaction_type IN ('Restocking', 'restock') THEN NEW.quantity 
                    ELSE -NEW.quantity 
                END)
            ELSE 0
        END;
        
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_update_inventory
    AFTER INSERT ON transaction_history
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory();

-- Display success message
DO $$
BEGIN
    RAISE NOTICE 'Trigger successfully updated to use UPSERT!';
END $$;
