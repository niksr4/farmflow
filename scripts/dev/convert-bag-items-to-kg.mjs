/**
 * Turn an item recorded in bags into the same stock recorded in kilos.
 *
 * Run: node --env-file=.env.local scripts/dev/convert-bag-items-to-kg.mjs [prod]
 *        (lists what is still in bags, and does nothing)
 *      node --env-file=.env.local scripts/dev/convert-bag-items-to-kg.mjs [prod] \
 *        --tenant "Seshagiri" --item "Urea" --kg-per-bag 45 --commit
 *
 * "bags" stopped being a unit because it is not one: a bag of urea is 45 kg, a bag of MOP or DAP is
 * 50, and an estate writing "73.5" means a different weight for each. Six items across two tenants
 * were recorded before that, and they cannot be converted by guessing -- only the estate knows
 * which sack held what.
 *
 * WHAT MOVES AND WHAT MUST NOT. Quantity is multiplied, the per-unit price is divided, and
 * total_cost is left exactly where it is. That is the whole point: 82 bags at Rs 1,922 is
 * Rs 1,57,600 of MOP, and it is still Rs 1,57,600 of MOP when it becomes 4,100 kg at Rs 38.44. A
 * conversion that changed what the stock is worth would be a revaluation wearing a unit change's
 * clothes -- and this codebase already has 59 rows of exactly that mistake, sitting in HoneyFarm's
 * ledger under "Price updated%", which every report now has to exclude by hand.
 *
 * THE LEDGER IS CONVERTED TOO, not just the balance. transaction_history rows for the item carry
 * their own quantity, price and total_cost, and recalculateInventoryForItem replays them to rebuild
 * the balance -- so leaving them in bags would mean the next edit to any of those rows silently
 * restores the bag quantity over the converted one.
 *
 * kg_per_bag is remembered on the item (scripts/139) so the stock form can offer bags as an input
 * next time without anyone retyping the sack size.
 */
import { neon } from "@neondatabase/serverless"

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : null
}
const isProd = args.includes("prod")
const commit = args.includes("--commit")
const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)

const tenantName = flag("tenant")
const itemName = flag("item")
const kgPerBag = Number(flag("kg-per-bag"))
const money = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })

// ── with no arguments, just report what is still in bags ─────────────────────
if (!tenantName || !itemName) {
  console.log(`\n=== ${isProd ? "PROD" : "DEV"} — stock still recorded in bags ===\n`)
  const rows = await sql`
    SELECT t.name AS tenant, ci.item_type, ci.quantity, ci.avg_price, ci.total_cost
    FROM current_inventory ci JOIN tenants t ON t.id = ci.tenant_id
    WHERE ci.unit = 'bags' ORDER BY t.name, ci.item_type`
  if (!rows.length) console.log("  none — everything is weighed or measured\n")
  for (const r of rows) {
    console.log(`  ${r.tenant.padEnd(12)} ${r.item_type.padEnd(16)} ${String(r.quantity).padStart(7)} bags` +
      `  @ ${money(r.avg_price)}/bag  = ${money(r.total_cost)}`)
  }
  console.log("\n  Convert one with:  --tenant \"<name>\" --item \"<item>\" --kg-per-bag <n> --commit\n")
  process.exit(0)
}

if (!Number.isFinite(kgPerBag) || kgPerBag <= 0) {
  console.error("--kg-per-bag must be a positive number. Ask the estate; do not assume 50.")
  process.exit(2)
}

const [tenant] = await sql`SELECT id, name FROM tenants WHERE name = ${tenantName}`
if (!tenant) {
  console.error(`No tenant named "${tenantName}" on ${isProd ? "PROD" : "DEV"}.`)
  process.exit(1)
}

// No id column: current_inventory is keyed by (tenant_id, location_id, item_type, unit).
const slots = await sql`
  SELECT location_id, item_type, quantity, unit, avg_price, total_cost
  FROM current_inventory
  WHERE tenant_id = ${tenant.id} AND item_type = ${itemName}`

if (!slots.length) {
  console.error(`${tenant.name} holds no item called "${itemName}".`)
  process.exit(1)
}
const inBags = slots.filter((s) => String(s.unit) === "bags")
if (!inBags.length) {
  console.error(`"${itemName}" is already recorded in ${slots.map((s) => s.unit).join("/")} — nothing to convert.`)
  process.exit(1)
}

const ledger = await sql`
  SELECT transaction_type, quantity, price, total_cost, transaction_date::date::text AS d
  FROM transaction_history
  WHERE tenant_id = ${tenant.id} AND item_type = ${itemName}
  ORDER BY transaction_date`

console.log(`\n=== ${isProd ? "PRODUCTION" : "DEV"} — ${tenant.name} / ${itemName} @ ${kgPerBag} kg per bag ===\n`)
for (const s of inBags) {
  console.log(`  balance : ${s.quantity} bags @ ${money(s.avg_price)}  = ${money(s.total_cost)}`)
  console.log(`         -> ${Number(s.quantity) * kgPerBag} kg @ ${money(Number(s.avg_price) / kgPerBag)}  = ${money(s.total_cost)}  (unchanged)`)
}
console.log(`\n  ledger rows to convert: ${ledger.length}`)
for (const r of ledger.slice(0, 8)) {
  console.log(`    ${r.d}  ${String(r.transaction_type).padEnd(8)} ${String(r.quantity).padStart(7)} bags -> ` +
    `${Number(r.quantity) * kgPerBag} kg   ${money(r.total_cost)} (unchanged)`)
}

if (!commit) {
  console.log("\nDry run. Re-run with --commit to write.\n")
  process.exit(0)
}

// Quantity scales up, unit price scales down, total_cost is untouched. Written as explicit
// arithmetic rather than a recalculation so the invariant is visible in the diff.
for (const s of inBags) {
  await sql`
    UPDATE current_inventory
    SET quantity   = quantity * ${kgPerBag},
        unit       = 'kg',
        avg_price  = avg_price / ${kgPerBag},
        kg_per_bag = ${kgPerBag}
    WHERE tenant_id = ${tenant.id}
      AND item_type = ${itemName}
      AND unit = 'bags'
      AND location_id IS NOT DISTINCT FROM ${s.location_id}`
}

await sql`
  UPDATE transaction_history
  SET quantity = quantity * ${kgPerBag},
      unit     = 'kg',
      price    = CASE WHEN price IS NULL THEN NULL ELSE price / ${kgPerBag} END
  WHERE tenant_id = ${tenant.id} AND item_type = ${itemName}`

const [after] = await sql`
  SELECT quantity, unit, avg_price, total_cost, kg_per_bag
  FROM current_inventory WHERE tenant_id = ${tenant.id} AND item_type = ${itemName} LIMIT 1`
console.log(`\nWRITTEN. ${itemName}: ${after.quantity} ${after.unit} @ ${money(after.avg_price)} ` +
  `= ${money(after.total_cost)}, remembered as ${after.kg_per_bag} kg/bag\n`)
