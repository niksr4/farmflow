/**
 * Fold a tenant's "legacy (unassigned)" stock into a real storehouse.
 *
 * Run: node --env-file=.env.local scripts/dev/merge-unassigned-stock.mjs <Tenant> [prod]
 *      node --env-file=.env.local scripts/dev/merge-unassigned-stock.mjs <Tenant> [prod] --commit
 *
 * WHY THIS EXISTS. Stock with location_id IS NULL is not in a store; it is nowhere. It shows as a
 * separate pile in the UI, it is easy to restock into by accident, and it splits one item's
 * quantity and cost across two rows that no report adds back together. HoneyFarm hit exactly that:
 * two restocks on 2026-08-27 landed in nowhere rather than Main store.
 *
 * THE COSTS ARE THE DANGEROUS PART, WHICH IS WHY THIS DRY-RUNS BY DEFAULT AND FLAGS BEFORE IT
 * MOVES ANYTHING. Merging two rows of the same item means a weighted average: the destination's
 * new unit cost is (qtyA*costA + qtyB*costB) / (qtyA + qtyB). If either side's price is a typo,
 * the merge does not just carry the error across -- it blends it into a number that no longer
 * matches any invoice, and the original is gone. A wrong price is far easier to spot as "750 kg at
 * Rs 1,850" sitting on its own than as an averaged Rs 1,828 in a merged row.
 *
 * So every collision is checked against the destination's existing price for the same item, and
 * anything beyond PRICE_RATIO_FLAG is reported for a human to confirm with the estate first. The
 * script refuses to commit while any flag is outstanding unless --force-prices is passed.
 *
 * NOTHING IS DELETED. Rows are repointed, and where both sides hold the same item the two are
 * summed into one. transaction_history moves with the stock so the ledger and the balance agree --
 * the same reasoning as scripts/137.
 */
import { neon } from "@neondatabase/serverless"

const args = process.argv.slice(2)
const tenantName = args.find((a) => !a.startsWith("--") && a !== "prod")
const isProd = args.includes("prod")
const commit = args.includes("--commit")
const forcePrices = args.includes("--force-prices")

if (!tenantName) {
  console.error("Usage: merge-unassigned-stock.mjs <Tenant name> [prod] [--commit] [--force-prices]")
  process.exit(1)
}

const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)

/** A price this many times the destination's own price for the same item is worth a human look. */
const PRICE_RATIO_FLAG = 3

const money = (n) => `Rs ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

const [tenant] = await sql`SELECT id, name FROM tenants WHERE name = ${tenantName}`
if (!tenant) { console.error(`No tenant named ${tenantName} on ${isProd ? "PROD" : "dev"}.`); process.exit(1) }

const stores = await sql`
  SELECT id, name FROM locations
  WHERE tenant_id = ${tenant.id} AND kind = 'store' ORDER BY name`

if (stores.length === 0) {
  console.error(`${tenant.name} has no storehouse to merge into. Create one first.`)
  process.exit(1)
}
if (stores.length > 1) {
  // Picking one on their behalf would silently decide where the stock lives.
  console.error(`${tenant.name} has ${stores.length} storehouses (${stores.map((s) => s.name).join(", ")}).`)
  console.error("This script only handles the single-store case; say which one explicitly instead.")
  process.exit(1)
}
const destination = stores[0]

const orphans = await sql`
  SELECT item_type, unit, quantity, total_cost, avg_price
  FROM current_inventory
  WHERE tenant_id = ${tenant.id} AND location_id IS NULL
  ORDER BY item_type`

console.log(`\n=== ${isProd ? "PRODUCTION" : "dev"} — ${tenant.name} ===`)
console.log(`Folding unassigned stock into: ${destination.name}\n`)

if (orphans.length === 0) {
  console.log("Nothing is unassigned. Nothing to do.\n")
  process.exit(0)
}

const flags = []
let movedValue = 0

for (const o of orphans) {
  const [existing] = await sql`
    SELECT quantity, total_cost, avg_price FROM current_inventory
    WHERE tenant_id = ${tenant.id} AND item_type = ${o.item_type}
      AND unit = ${o.unit} AND location_id = ${destination.id}`

  movedValue += Number(o.total_cost)

  if (!existing) {
    console.log(`  ${o.item_type.padEnd(30)} ${String(o.quantity).padStart(8)} ${o.unit.padEnd(4)} @ ${money(o.avg_price)}  → moves across, no merge`)
    continue
  }

  const qty = Number(o.quantity) + Number(existing.quantity)
  const cost = Number(o.total_cost) + Number(existing.total_cost)
  const blended = qty > 0 ? cost / qty : 0

  console.log(`  ${o.item_type.padEnd(30)} ${String(o.quantity).padStart(8)} ${o.unit.padEnd(4)} @ ${money(o.avg_price)}`)
  console.log(`  ${"".padEnd(30)} ${String(existing.quantity).padStart(8)} ${o.unit.padEnd(4)} @ ${money(existing.avg_price)}  already in ${destination.name}`)
  console.log(`  ${"".padEnd(30)} ${String(qty).padStart(8)} ${o.unit.padEnd(4)} @ ${money(blended)}  ← merged, value ${money(cost)}`)

  // Only compare when the destination has a real price to compare against; a Rs 0 row means
  // "never priced", which is a different problem and not evidence about this one.
  const a = Number(o.avg_price)
  const b = Number(existing.avg_price)
  if (a > 0 && b > 0) {
    const ratio = a > b ? a / b : b / a
    if (ratio >= PRICE_RATIO_FLAG) {
      const restocks = await sql`
        SELECT transaction_date::text AS date, quantity, price
        FROM transaction_history
        WHERE tenant_id = ${tenant.id} AND item_type = ${o.item_type}
          AND location_id IS NULL AND COALESCE(price, 0) > 0
        ORDER BY transaction_date`
      flags.push({
        item: o.item_type,
        unit: o.unit,
        unassigned: a,
        existing: b,
        ratio,
        blended,
        exposure: Number(o.total_cost),
        perTransaction: restocks.map((r) => ({
          date: String(r.date).slice(0, 10),
          quantity: Number(r.quantity),
          price: Number(r.price),
        })),
      })
    }
  }
  console.log("")
}

console.log(`  ${orphans.length} item(s), ${money(movedValue)} of stock value moving into ${destination.name}\n`)

if (flags.length > 0) {
  console.log("─".repeat(78))
  console.log("PRICES WORTH CONFIRMING WITH THE ESTATE BEFORE MERGING")
  console.log("─".repeat(78))
  for (const f of flags) {
    console.log(`\n  ${f.item} (${f.unit})`)
    console.log(`    unassigned pile : ${money(f.unassigned)} per ${f.unit}`)
    console.log(`    ${destination.name.padEnd(15)} : ${money(f.existing)} per ${f.unit}`)
    console.log(`    that is ${f.ratio.toFixed(1)}x their own price for the same item`)

    /**
     * The commonest way this goes wrong, so it is worth testing out loud rather than leaving the
     * estate to work out what we are asking about: the TOTAL PAID typed into the unit-price box.
     * If that is what happened, dividing by the quantity lands back near their usual price -- and
     * when two independent restocks of the same item both land on the same figure, it is not a
     * coincidence. Seshagiri's DAP did exactly that: 50 bags "at 70,000" and 40 bags "at 56,000"
     * are Rs 1,400 a bag both times, against Rs 1,350 in the store.
     */
    for (const line of f.perTransaction) {
      const implied = line.price / line.quantity
      const off = Math.abs(implied - f.existing) / f.existing * 100
      const verdict = off <= 25 ? "  ← lands on their usual price" : ""
      console.log(`      if "${money(line.price)}" was the total for ${line.quantity} ${f.unit} on ${line.date}: ${money(implied)} per ${f.unit}${verdict}`)
    }
    console.log(`    if wrong, ${money(f.exposure)} of stock value is wrong, and after merging it`)
    console.log(`    becomes ${money(f.blended)} per ${f.unit} — blended, and no longer matching any invoice`)
  }
  console.log(`\n  Ask the estate what they actually paid. Correct the entry, then re-run this.`)
  console.log(`  (To merge anyway: --force-prices. The numbers move as-is, errors included.)\n`)
}

if (!commit) {
  console.log("Dry run. Nothing written. Re-run with --commit to apply.\n")
  process.exit(0)
}
if (flags.length > 0 && !forcePrices) {
  console.error("Refusing to merge while prices are unconfirmed. Resolve them, or pass --force-prices.\n")
  process.exit(1)
}

// ── the merge itself ────────────────────────────────────────────────────────
// Order matters: fold the collisions first, then repoint what is left, then move the ledger.
for (const o of orphans) {
  const [existing] = await sql`
    SELECT quantity, total_cost FROM current_inventory
    WHERE tenant_id = ${tenant.id} AND item_type = ${o.item_type}
      AND unit = ${o.unit} AND location_id = ${destination.id}`

  if (existing) {
    const qty = Number(o.quantity) + Number(existing.quantity)
    const cost = Number(o.total_cost) + Number(existing.total_cost)
    // avg_price is recomputed from the totals rather than averaged from the two averages --
    // averaging averages is wrong the moment the quantities differ.
    await sql`
      UPDATE current_inventory
      SET quantity = ${qty}, total_cost = ${cost}, avg_price = ${qty > 0 ? cost / qty : 0}
      WHERE tenant_id = ${tenant.id} AND item_type = ${o.item_type}
        AND unit = ${o.unit} AND location_id = ${destination.id}`
    await sql`
      DELETE FROM current_inventory
      WHERE tenant_id = ${tenant.id} AND item_type = ${o.item_type}
        AND unit = ${o.unit} AND location_id IS NULL`
  } else {
    await sql`
      UPDATE current_inventory SET location_id = ${destination.id}
      WHERE tenant_id = ${tenant.id} AND item_type = ${o.item_type}
        AND unit = ${o.unit} AND location_id IS NULL`
  }
}

// The ledger follows the stock, or the movements and the balance disagree about where things are.
const ledger = await sql`
  UPDATE transaction_history SET location_id = ${destination.id}
  WHERE tenant_id = ${tenant.id} AND location_id IS NULL
  RETURNING id`

const [after] = await sql`
  SELECT COUNT(*)::int orphan_items FROM current_inventory
  WHERE tenant_id = ${tenant.id} AND location_id IS NULL`
const [dest] = await sql`
  SELECT COUNT(*)::int items, COALESCE(SUM(total_cost),0)::numeric value
  FROM current_inventory WHERE tenant_id = ${tenant.id} AND location_id = ${destination.id}`

console.log(`WRITTEN.`)
console.log(`  ${ledger.length} ledger row(s) repointed to ${destination.name}`)
console.log(`  unassigned items remaining: ${after.orphan_items}`)
console.log(`  ${destination.name} now holds ${dest.items} items worth ${money(dest.value)}\n`)
