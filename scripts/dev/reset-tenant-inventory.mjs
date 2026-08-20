/**
 * Clear one tenant's store room so they can enter it properly, once.
 *
 * Run: node scripts/dev/reset-tenant-inventory.mjs "<tenant>" [prod] [--commit]
 *      Without --commit it prints exactly what it would delete and writes nothing.
 *
 * THIS IS ONLY EVER RIGHT FOR A STORE ROOM NOBODY HAS USED. Deleting movement history destroys
 * the audit trail, and where an expense was valued from a stock cost, it orphans the pair that
 * produced the number. HoneyFarm must never be run through this: 362 movements over ten months,
 * 112 expenses worth Rs 5,19,932 derived from those costs, and a season still in flight. Their
 * fix is a dated recount, not a delete.
 *
 * Laxmi is the opposite case and the reason this exists. Nine rows, all inside a nine-day window
 * in May, then nothing. Three of the seven items are coffee produce -- parchment and cherry --
 * which belong to processing and dispatch, not the store; leaving them would double-count against
 * processing_records the day they start using it. "19 all" and "19 19 19" are the same fertiliser
 * entered twice under different names. There is no audit trail here to protect, only an abandoned
 * first attempt, and no expense anywhere derives from it.
 *
 * So the guard below is not ceremony. It refuses any tenant whose stock is load-bearing.
 */
import { neon } from "@neondatabase/serverless"

const [nameArg] = process.argv.slice(2)
const isProd = process.argv.includes("prod")
const commit = process.argv.includes("--commit")

if (!nameArg) {
  console.error('usage: reset-tenant-inventory.mjs "<tenant>" [prod] [--commit]')
  process.exit(2)
}

const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)
const rows = await sql`SELECT id, name FROM tenants WHERE name = ${nameArg}`
if (!rows.length) {
  console.error(`No tenant named "${nameArg}" on ${isProd ? "PROD" : "DEV"}.`)
  process.exit(1)
}
const { id: tenantId, name } = rows[0]

console.log(`\n=== ${isProd ? "PRODUCTION" : "DEV"} — clear ${name}'s inventory ===\n`)

const [stock, history, linkedExpenses, processing, dispatch, sales] = await Promise.all([
  sql`SELECT item_type, quantity::float q, unit FROM current_inventory WHERE tenant_id = ${tenantId} AND quantity <> 0 ORDER BY quantity DESC`,
  sql`SELECT COUNT(*)::int n, MIN(transaction_date)::date::text a, MAX(transaction_date)::date::text b FROM transaction_history WHERE tenant_id = ${tenantId}`,
  sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_amount),0)::float v FROM expense_transactions WHERE tenant_id = ${tenantId} AND inventory_item_type IS NOT NULL`,
  sql`SELECT COUNT(*)::int n FROM processing_records WHERE tenant_id = ${tenantId}`,
  sql`SELECT COUNT(*)::int n FROM dispatch_records WHERE tenant_id = ${tenantId}`,
  sql`SELECT COUNT(*)::int n FROM sales_records WHERE tenant_id = ${tenantId}`,
])

console.log(`stock slots holding stock : ${stock.length}`)
for (const s of stock) console.log(`   ${String(s.q).padStart(8)} ${String(s.unit).padEnd(4)} ${s.item_type}`)
console.log(`\nmovement history          : ${history[0].n} rows  [${history[0].a || "-"} .. ${history[0].b || "-"}]`)
console.log(`expenses valued from stock: ${linkedExpenses[0].n}  (Rs ${Number(linkedExpenses[0].v).toLocaleString("en-IN")})`)
console.log(`processing / dispatch / sales records: ${processing[0].n} / ${dispatch[0].n} / ${sales[0].n}`)

// Refuse anything with a real trail. These thresholds are deliberately low -- the point is to
// catch "this tenant actually uses inventory", not to permit a large-but-tolerable loss.
const blockers = []
if (linkedExpenses[0].n > 0) blockers.push(`${linkedExpenses[0].n} expense(s) were valued from these stock costs — deleting orphans them`)
if (history[0].n > 40) blockers.push(`${history[0].n} movements is a real ledger, not an abandoned first attempt`)
if (processing[0].n + dispatch[0].n + sales[0].n > 0) blockers.push("this tenant has processing/dispatch/sales records — stock may feed them")

if (blockers.length) {
  console.log(`\nREFUSED — ${name}'s inventory is load-bearing:`)
  for (const b of blockers) console.log(`   - ${b}`)
  console.log("\nUse a dated recount instead: correct the quantity and revalue the price, keeping history.")
  process.exit(1)
}

if (!commit) {
  console.log("\nSafe to clear. Dry run — re-run with --commit to write.")
  process.exit(0)
}

const del = await sql`DELETE FROM transaction_history WHERE tenant_id = ${tenantId} RETURNING id`
const del2 = await sql`DELETE FROM current_inventory WHERE tenant_id = ${tenantId} RETURNING item_type`
const del3 = await sql`DELETE FROM current_inventory_violations WHERE tenant_id = ${tenantId} RETURNING item_type`
console.log(`\ncleared: ${del.length} movements, ${del2.length} stock slots, ${del3.length} violation rows`)
console.log(`${name} can now enter their store room from scratch.`)
