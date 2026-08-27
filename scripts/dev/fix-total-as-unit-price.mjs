/**
 * Correct restocks where the TOTAL PAID was typed into the unit-price box.
 *
 * Run: node --env-file=.env.local scripts/dev/fix-total-as-unit-price.mjs <Tenant> [prod]
 *      node --env-file=.env.local scripts/dev/fix-total-as-unit-price.mjs <Tenant> [prod] --commit
 *
 * Seshagiri's unassigned pile carried Rs 1.03 crore of stock value against roughly Rs 2.6 lakh of
 * actual purchases. The signature is unmistakable: DAP was entered twice, as 50 bags "at 70,000"
 * and 40 bags "at 56,000", and dividing each by its quantity gives Rs 1,400 a bag both times --
 * against Rs 1,350 in their storehouse. Two independent purchases landing on the same figure is
 * not a coincidence, and MOP and Urea land within 3% and 9% of their own store prices the same way.
 *
 * WHAT THIS DOES. For each affected movement, price becomes price / quantity and total_cost becomes
 * the old price (which was the total all along). Then current_inventory is rebuilt from the
 * corrected movements rather than patched, so the stored quantity, total_cost and avg_price cannot
 * drift from the ledger they are supposed to summarise.
 *
 * SCOPED TO THE ROWS NAMED IN CORRECTIONS BELOW, deliberately. There is no heuristic here that
 * decides on its own what looks wrong -- a script that rewrites prices by pattern-matching would
 * eventually rewrite a real one. The suspects come from merge-unassigned-stock.mjs, a human asks
 * the estate, and the confirmed ones get listed here by id.
 */
import { neon } from "@neondatabase/serverless"

const args = process.argv.slice(2)
const tenantName = args.find((a) => !a.startsWith("--") && a !== "prod")
const isProd = args.includes("prod")
const commit = args.includes("--commit")

const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)

/**
 * Which movements were confirmed as "the figure was the total".
 *
 * Keyed by tenant name → list of {item, date} so the script reads as the decision that was made,
 * not as a rule that might catch something else later.
 */
const CORRECTIONS = {
  Seshagiri: [
    { item: "DAP", date: "2026-07-17" },
    { item: "DAP", date: "2026-08-14" },
    { item: "MOP", date: "2026-08-14" },
    { item: "Urea", date: "2026-08-14" },
    { item: "Ammophos", date: "2026-08-14" },
  ],
}

const money = (n) => `Rs ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

const targets = CORRECTIONS[tenantName]
if (!targets) {
  console.error(`No confirmed corrections recorded for "${tenantName}".`)
  console.error(`Known: ${Object.keys(CORRECTIONS).join(", ")}`)
  process.exit(1)
}

const [tenant] = await sql`SELECT id, name FROM tenants WHERE name = ${tenantName}`
if (!tenant) { console.error(`No tenant named ${tenantName}.`); process.exit(1) }

console.log(`\n=== ${isProd ? "PRODUCTION" : "dev"} — ${tenant.name} ===\n`)

const planned = []
for (const target of targets) {
  const rows = await sql`
    SELECT id, item_type, unit, quantity, price, total_cost, location_id, transaction_date::text AS date
    FROM transaction_history
    WHERE tenant_id = ${tenant.id}
      AND item_type = ${target.item}
      AND transaction_date::date = ${target.date}::date
      AND COALESCE(price, 0) > 0`
  if (rows.length === 0) {
    console.log(`  !  ${target.item} on ${target.date}: no matching movement (already corrected?)`)
    continue
  }
  for (const r of rows) {
    const qty = Number(r.quantity)
    const wrongPrice = Number(r.price)
    if (qty <= 0) { console.log(`  !  ${r.item_type} ${r.date}: quantity is ${qty}, skipping`); continue }
    planned.push({ id: r.id, item: r.item_type, unit: r.unit, locationId: r.location_id, date: r.date.slice(0, 10), qty, wrongPrice, newPrice: wrongPrice / qty })
  }
}

if (planned.length === 0) { console.log("Nothing to correct.\n"); process.exit(0) }

let before = 0
let after = 0
for (const p of planned) {
  before += p.wrongPrice * p.qty
  after += p.wrongPrice
  console.log(`  ${p.item.padEnd(10)} ${p.date}  ${String(p.qty).padStart(5)} ${p.unit}`)
  console.log(`     was: ${money(p.wrongPrice)} per ${p.unit}  → total ${money(p.wrongPrice * p.qty)}`)
  console.log(`     now: ${money(p.newPrice)} per ${p.unit}  → total ${money(p.wrongPrice)}\n`)
}
console.log(`  stock value on these movements: ${money(before)}  →  ${money(after)}`)
console.log(`  overstatement removed: ${money(before - after)}\n`)

if (!commit) { console.log("Dry run. Nothing written. Re-run with --commit.\n"); process.exit(0) }

for (const p of planned) {
  await sql`
    UPDATE transaction_history
    SET price = ${p.newPrice}, total_cost = ${p.wrongPrice}
    WHERE id = ${p.id} AND tenant_id = ${tenant.id}`
}

/**
 * Rebuild the affected current_inventory rows from the ledger rather than adjusting them.
 *
 * The stored row is a summary of the movements; recomputing it is the only way to be sure the two
 * agree afterwards. Restocks add quantity and cost, depletions remove quantity at the running
 * average -- which is what the app's own weighted-average costing does.
 *
 * ONLY THE LOCATIONS THAT WERE ACTUALLY CORRECTED ARE REWRITTEN. The first version of this
 * recomputed every location holding the item, and that quietly zeroed a balance it had no business
 * touching: Seshagiri's Ammophos has mixed units in its ledger -- 10 BAGS restocked in February,
 * 8 KG depleted in June, 20 KG restocked in August -- so a rebuild filtered on unit='kg' never saw
 * the February restock and computed a balance of nothing. The stored 2 kg was right; the ledger it
 * was derived from is inconsistent, which is a separate problem and not one to "fix" by silently
 * deleting the stock. A correction must not reach past the rows it was asked to correct.
 */
const correctedLocations = new Set(planned.map((p) => `${p.item}|${p.unit}|${p.locationId ?? "__null__"}`))
const touched = [...new Set(planned.map((p) => `${p.item}|${p.unit}`))]
for (const key of touched) {
  const [item, unit] = key.split("|")
  const moves = await sql`
    SELECT transaction_type, quantity, price, total_cost, location_id
    FROM transaction_history
    WHERE tenant_id = ${tenant.id} AND item_type = ${item} AND unit = ${unit}
    ORDER BY transaction_date, id`

  // Rebuilt per location, because stock in two sheds is two balances.
  const byLocation = new Map()
  for (const m of moves) {
    const loc = m.location_id ?? "__null__"
    const acc = byLocation.get(loc) ?? { qty: 0, cost: 0 }
    const q = Number(m.quantity)
    if (String(m.transaction_type).toLowerCase() === "restock") {
      acc.qty += q
      acc.cost += Number(m.total_cost)
    } else {
      const avg = acc.qty > 0 ? acc.cost / acc.qty : 0
      acc.qty -= q
      acc.cost -= avg * q
      if (acc.qty <= 0) { acc.qty = Math.max(0, acc.qty); acc.cost = Math.max(0, acc.cost) }
    }
    byLocation.set(loc, acc)
  }

  for (const [loc, acc] of byLocation) {
    if (!correctedLocations.has(`${item}|${unit}|${loc}`)) {
      console.log(`  left alone ${item} (${unit}) @ ${loc === "__null__" ? "unassigned" : loc} — not corrected here`)
      continue
    }
    const avg = acc.qty > 0 ? acc.cost / acc.qty : 0
    if (loc === "__null__") {
      await sql`
        UPDATE current_inventory SET quantity = ${acc.qty}, total_cost = ${acc.cost}, avg_price = ${avg}
        WHERE tenant_id = ${tenant.id} AND item_type = ${item} AND unit = ${unit} AND location_id IS NULL`
    } else {
      await sql`
        UPDATE current_inventory SET quantity = ${acc.qty}, total_cost = ${acc.cost}, avg_price = ${avg}
        WHERE tenant_id = ${tenant.id} AND item_type = ${item} AND unit = ${unit} AND location_id = ${loc}`
    }
    console.log(`  rebuilt ${item} (${unit}) @ ${loc === "__null__" ? "unassigned" : loc}: ${acc.qty} ${unit}, ${money(acc.cost)}, ${money(avg)}/${unit}`)
  }
}

const [total] = await sql`
  SELECT COALESCE(SUM(total_cost), 0)::numeric v FROM current_inventory WHERE tenant_id = ${tenant.id}`
console.log(`\nWRITTEN. ${tenant.name} stock value is now ${money(total.v)}.\n`)
