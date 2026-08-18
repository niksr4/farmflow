/**
 * Per-slot inventory drift, using the app's own ledger maths -- read-only.
 *
 * Run: node --experimental-strip-types --env-file=.env.local scripts/dev/inventory-drift-report.mjs
 *      (append `prod` to read production; needs DATABASE_URL exported from .env.vercel.production)
 *
 * The strip-types flag is needed because this imports the app's own TypeScript ledger module
 * rather than reimplementing the maths -- reimplementing it is precisely how the two
 * disagreeing definitions that caused the false drift reports came about in the first place.
 *
 * Uses classifySlotDrift so the numbers match what the reconciliation check reports, and so
 * back-dated entries (where the stored balance is the trustworthy one) are not confused with
 * genuinely missing history. Writes nothing.
 */
import { neon } from "@neondatabase/serverless"
import { classifySlotDrift } from "../../lib/inventory-ledger.ts"

const isProd = process.argv[2] === "prod"
const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)
const money = (n) => "Rs " + Math.round(n).toLocaleString("en-IN")

const tenants = await sql`SELECT id, name FROM tenants ORDER BY name`
console.log(`\n=== ${isProd ? "PROD" : "DEV"} inventory drift ===\n`)

let grandUnexplained = 0
let grandBackdated = 0

for (const t of tenants) {
  const slots = await sql`SELECT item_type, location_id, quantity, total_cost
                          FROM current_inventory WHERE tenant_id=${t.id}`
  if (!slots.length) continue
  const txns = await sql`SELECT item_type, location_id, transaction_type, quantity, total_cost,
                                transaction_date::text AS transaction_date, id
                         FROM transaction_history WHERE tenant_id=${t.id}`

  const key = (i, l) => `${i ?? ""}::${l ?? "null"}`
  const bySlot = new Map()
  for (const r of txns) {
    const k = key(r.item_type, r.location_id)
    if (!bySlot.has(k)) bySlot.set(k, [])
    bySlot.get(k).push(r)
  }

  const rows = []
  for (const s of slots) {
    const k = key(s.item_type, s.location_id)
    const bucket = bySlot.get(k) ?? []
    const byDate = [...bucket].sort((a, b) =>
      String(a.transaction_date).localeCompare(String(b.transaction_date)) || Number(a.id) - Number(b.id))
    const byInsertion = [...bucket].sort((a, b) => Number(a.id) - Number(b.id))
    const v = classifySlotDrift({ byDate, byInsertion, storedQuantity: Number(s.quantity) || 0 })
    if (v.cause === "consistent") continue
    rows.push({
      item: s.item_type,
      stored: Number(s.quantity) || 0,
      byDate: v.byDateQuantity,
      byInsertion: v.byInsertionQuantity,
      drift: Math.abs((Number(s.quantity) || 0) - v.byDateQuantity),
      cost: Number(s.total_cost) || 0,
      cause: v.cause,
      txns: bucket.length,
    })
  }

  if (!rows.length) { console.log(`${t.name}: ${slots.length} slots, all consistent\n`); continue }

  rows.sort((a, b) => b.drift - a.drift)
  const unexplained = rows.filter((r) => r.cause === "unexplained")
  const backdated = rows.filter((r) => r.cause === "backdated-entry")
  grandUnexplained += unexplained.reduce((s, r) => s + r.drift, 0)
  grandBackdated += backdated.reduce((s, r) => s + r.drift, 0)

  console.log(`${t.name} -- ${slots.length} slots, ${rows.length} drifting`)
  console.log(`  back-dated (stored balance is correct): ${backdated.length} slots, ${Math.round(backdated.reduce((s, r) => s + r.drift, 0)).toLocaleString("en-IN")} units`)
  console.log(`  UNEXPLAINED (missing history):          ${unexplained.length} slots, ${Math.round(unexplained.reduce((s, r) => s + r.drift, 0)).toLocaleString("en-IN")} units`)
  if (unexplained.length) {
    console.log(`\n  ${"item".padEnd(30)} ${"stored".padStart(10)} ${"ledger".padStart(10)} ${"drift".padStart(10)}  ${"value".padStart(12)}  txns`)
    for (const r of unexplained.slice(0, 30)) {
      console.log(`  ${String(r.item).slice(0, 30).padEnd(30)} ${r.stored.toFixed(1).padStart(10)} ${r.byDate.toFixed(1).padStart(10)} ${r.drift.toFixed(1).padStart(10)}  ${money(r.cost).padStart(12)}  ${r.txns}`)
    }
    if (unexplained.length > 30) console.log(`  ... and ${unexplained.length - 30} more`)
  }
  console.log()
}

console.log(`TOTAL back-dated (no action needed): ${Math.round(grandBackdated).toLocaleString("en-IN")} units`)
console.log(`TOTAL unexplained (needs a decision): ${Math.round(grandUnexplained).toLocaleString("en-IN")} units\n`)
