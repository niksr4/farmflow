/**
 * What each estate has to go and find: every item whose stock arrived without a price.
 *
 * Run: node scripts/dev/unpriced-stock-report.mjs   (DATABASE_URL exported = production)
 *
 * Value cannot be invented. If usage is going to be costed from what was paid at restock, then
 * stock already sitting in the store has to be priced from a real invoice, by the person who has
 * it. This prints the list per tenant, per item, with the dates and quantities so they know which
 * purchase they are looking for.
 */
import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL)
const num = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })

for (const t of await sql`SELECT id, name FROM tenants ORDER BY name`) {
  const rows = await sql`
    SELECT th.item_type, COALESCE(th.unit,'') unit,
           COUNT(*)::int deliveries,
           SUM(th.quantity)::numeric qty,
           MIN(th.transaction_date)::text first_seen,
           MAX(th.transaction_date)::text last_seen,
           STRING_AGG(DISTINCT NULLIF(th.notes,''), ' | ') AS notes
    FROM transaction_history th
    WHERE th.tenant_id = ${t.id}
      AND LOWER(th.transaction_type) IN ('restock','restocking')
      AND COALESCE(th.total_cost, 0) = 0
      AND COALESCE(th.notes,'') NOT ILIKE 'Price updated%'
    GROUP BY th.item_type, th.unit
    ORDER BY SUM(th.quantity) DESC`
  if (!rows.length) continue

  const stock = await sql`SELECT item_type, SUM(quantity)::numeric q FROM current_inventory
                          WHERE tenant_id=${t.id} GROUP BY item_type`
  const onHand = new Map(stock.map((s) => [s.item_type, Number(s.q)]))

  console.log(`\n${"=".repeat(78)}\n${t.name} — ${rows.length} item(s) need a price\n${"=".repeat(78)}`)
  console.log(`${"item".padEnd(30)} ${"delivered".padStart(12)} ${"still held".padStart(11)}  when`)
  console.log("-".repeat(78))
  for (const r of rows) {
    const held = onHand.get(r.item_type)
    const when = r.first_seen.slice(0, 10) === r.last_seen.slice(0, 10)
      ? r.first_seen.slice(0, 10)
      : `${r.first_seen.slice(0, 10)} .. ${r.last_seen.slice(0, 10)}`
    console.log(
      `${String(r.item_type).slice(0, 30).padEnd(30)} ${(num(r.qty) + " " + r.unit).padStart(12)} ` +
      `${(held == null ? "-" : num(held)).padStart(11)}  ${when}${r.deliveries > 1 ? `  (${r.deliveries} deliveries)` : ""}`,
    )
    if (r.notes) console.log(`${"".padEnd(30)} ${String(r.notes).slice(0, 60)}`)
  }
}
console.log("\nAsk each estate for the invoice total against each item. One number per row.\n")
