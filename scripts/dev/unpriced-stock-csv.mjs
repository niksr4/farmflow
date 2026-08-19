/**
 * One fillable file per estate: the items whose stock arrived without a price.
 *
 * Run: node scripts/dev/unpriced-stock-csv.mjs   (DATABASE_URL exported = production)
 *
 * CSV rather than a screen, because the answer is not in the app -- it is on an invoice in
 * somebody's office. They fill the last column in and send it back.
 */
import { neon } from "@neondatabase/serverless"
import { writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const sql = neon(process.env.DATABASE_URL)
const OUT = path.join(homedir(), "Desktop", "farmflow-stock-pricing")
mkdirSync(OUT, { recursive: true })
const csv = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

for (const t of await sql`SELECT id, name FROM tenants ORDER BY name`) {
  const rows = await sql`
    SELECT th.item_type, COALESCE(th.unit,'') unit,
           SUM(th.quantity)::numeric qty, COUNT(*)::int deliveries,
           MIN(th.transaction_date)::text first_seen, MAX(th.transaction_date)::text last_seen,
           STRING_AGG(DISTINCT NULLIF(th.notes,''), ' / ') AS hints
    FROM transaction_history th
    WHERE th.tenant_id = ${t.id}
      AND LOWER(th.transaction_type) IN ('restock','restocking')
      AND COALESCE(th.total_cost,0) = 0
      AND COALESCE(th.notes,'') NOT ILIKE 'Price updated%'
    GROUP BY th.item_type, th.unit
    ORDER BY SUM(th.quantity) DESC`
  if (!rows.length) continue

  const held = new Map((await sql`SELECT item_type, SUM(quantity)::numeric q FROM current_inventory
                                  WHERE tenant_id=${t.id} GROUP BY item_type`).map((r) => [r.item_type, Number(r.q)]))

  const lines = [
    `FarmFlow - stock pricing for ${t.name}`,
    `Please fill in the LAST column only: what you paid in total for that item, in rupees.`,
    `If an item came in more than one delivery, give the total across all of them.`,
    `Leave a row blank if you genuinely cannot find it - we will leave that item unpriced rather than guess.`,
    ``,
    ["Item", "Unit", "Total quantity received", "Still in store", "When", "Deliveries", "Your note / supplier", "TOTAL PAID (Rs)"].map(csv).join(","),
  ]
  for (const r of rows) {
    const when = r.first_seen.slice(0, 10) === r.last_seen.slice(0, 10)
      ? r.first_seen.slice(0, 10)
      : `${r.first_seen.slice(0, 10)} to ${r.last_seen.slice(0, 10)}`
    lines.push([
      r.item_type, r.unit, r.qty,
      held.has(r.item_type) ? held.get(r.item_type) : "",
      when, r.deliveries, (r.hints || "").slice(0, 60), "",
    ].map(csv).join(","))
  }
  const file = path.join(OUT, `${t.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-stock-pricing.csv`)
  writeFileSync(file, lines.join("\n") + "\n")
  console.log(`  ${t.name.padEnd(16)} ${String(rows.length).padStart(2)} items -> ${file}`)
}
