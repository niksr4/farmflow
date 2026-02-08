// Node.js script to convert your JSON data into SQL INSERT statements
// Run this locally to generate the SQL files

const fs = require("fs")

// Read your JSON files
const consumablesData = require("./accounts.json") // Your accounts.txt renamed to .json
const inventoryData = require("./inventory.json") // Your inventory.txt renamed to .json

// Function to escape SQL strings
function escapeSql(str) {
  if (str === null || str === undefined) return "NULL"
  return "'" + String(str).replace(/'/g, "''") + "'"
}

// Generate consumables INSERT statements
function generateConsumablesSQL(data) {
  let sql = `-- Generated Consumables Import Script
-- Total records: ${data.length}
-- Generated: ${new Date().toISOString()}

INSERT INTO labor_consumables (transaction_id, type, description, amount, unit, cost, date, reference, user_id)
VALUES\n`

  const values = data.map((item, index) => {
    const isLast = index === data.length - 1
    return `    (${escapeSql(item.id)}, 'consumable', ${escapeSql(item.notes || item.reference)}, 1, 'units', ${item.amount}, ${escapeSql(item.date)}, ${escapeSql(item.code)}, ${escapeSql(item.user)})${isLast ? ";" : ","}`
  })

  sql += values.join("\n")
  sql += "\n\n-- Verification queries\n"
  sql += `SELECT COUNT(*) as imported_count FROM labor_consumables WHERE type = 'consumable';\n`
  sql += `SELECT SUM(cost) as total_cost FROM labor_consumables WHERE type = 'consumable';\n`

  return sql
}

// Generate inventory INSERT statements
function generateInventorySQL(data) {
  let sql = `-- Generated Inventory Import Script
-- Total records: ${data.length}
-- Generated: ${new Date().toISOString()}

INSERT INTO inventory_transactions (
    transaction_id, item_name, quantity, transaction_type, notes, date, user_id, unit, unit_price, total_value
)
VALUES\n`

  const values = data.map((item, index) => {
    const isLast = index === data.length - 1
    const price = item.price !== undefined ? item.price : "NULL"
    const totalCost = item.totalCost !== undefined ? item.totalCost : "NULL"

    return `    (${escapeSql(item.id)}, ${escapeSql(item.itemType)}, ${item.quantity}, ${escapeSql(item.transactionType)}, ${escapeSql(item.notes)}, ${escapeSql(item.date)}, ${escapeSql(item.user)}, ${escapeSql(item.unit)}, ${price}, ${totalCost})${isLast ? ";" : ","}`
  })

  sql += values.join("\n")
  sql += "\n\n-- Verification queries\n"
  sql += `SELECT COUNT(*) as imported_count FROM inventory_transactions;\n`
  sql += `SELECT COUNT(DISTINCT item_name) as unique_items FROM inventory_transactions;\n`
  sql += `SELECT * FROM current_inventory;\n`

  return sql
}

// Generate the SQL files
console.log("🔄 Generating SQL insert statements...")

const consumablesSQL = generateConsumablesSQL(consumablesData)
const inventorySQL = generateInventorySQL(inventoryData)

fs.writeFileSync("02-import-consumables-full.sql", consumablesSQL)
fs.writeFileSync("03-import-inventory-full.sql", inventorySQL)

console.log("✅ Generated files:")
console.log("   - 02-import-consumables-full.sql")
console.log("   - 03-import-inventory-full.sql")
console.log("")
console.log("📊 Summary:")
console.log(`   Consumables: ${consumablesData.length} records`)
console.log(`   Inventory: ${inventoryData.length} records`)
console.log("")
console.log("🚀 Next steps:")
console.log("   1. Go to your Neon dashboard")
console.log("   2. Open the SQL Editor")
console.log("   3. Run 01-create-tables.sql first")
console.log("   4. Run 02-import-consumables-full.sql")
console.log("   5. Run 03-import-inventory-full.sql")
