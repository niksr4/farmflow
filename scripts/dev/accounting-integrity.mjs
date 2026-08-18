/**
 * Structural integrity of the money: orphans, impossible values, and the physical chains.
 *
 * Run: node --env-file=.env.local scripts/dev/accounting-integrity.mjs   (append nothing; reads dev)
 *      DATABASE_URL exported + edit the connection line for prod.
 *
 * Complements accounting-crosscheck.mjs, which asks whether the tabs AGREE. This asks whether
 * the underlying rows are POSSIBLE: a cost pointing at a deleted worker, a negative expense, a
 * yield above 100%. Read-only.
 */
import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL)
const money = n => "Rs " + Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0})
const num = n => Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:1})

console.log("=== 1. dispatch -> sales chain: does what left equal what sold? ===")
for (const t of await sql`SELECT id,name FROM tenants ORDER BY name`) {
  const d = await sql`SELECT COALESCE(SUM(bags_dispatched),0)::numeric bags, COALESCE(SUM(kgs_received),0)::numeric kg,
                             COUNT(*)::int n FROM dispatch_records WHERE tenant_id=${t.id}`
  const s = await sql`SELECT COALESCE(SUM(bags_sold),0)::numeric bags, COALESCE(SUM(kgs),0)::numeric kg,
                             COUNT(*)::int n FROM sales_records WHERE tenant_id=${t.id}`
  if (!Number(d[0].n) && !Number(s[0].n)) continue
  console.log(`  ${t.name.padEnd(16)} dispatched ${num(d[0].bags).padStart(8)} bags / ${num(d[0].kg).padStart(10)} kg received  |  sold ${num(s[0].bags).padStart(8)} bags / ${num(s[0].kg).padStart(10)} kg`)
}

console.log("\n=== 2. processing yield: cherry in vs dry out ===")
for (const t of await sql`SELECT id,name FROM tenants ORDER BY name`) {
  try {
    const p = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(crop_today),0)::numeric cherry,
      COALESCE(SUM(dry_parch),0)::numeric parch, COALESCE(SUM(dry_cherry),0)::numeric dry
      FROM processing_records WHERE tenant_id=${t.id}`
    if (!Number(p[0].n)) continue
    const out = Number(p[0].parch)+Number(p[0].dry), inp = Number(p[0].cherry)
    const y = inp ? (out/inp*100).toFixed(1) : "n/a"
    console.log(`  ${t.name.padEnd(16)} ${p[0].n} records  cherry ${num(inp).padStart(10)} kg -> out ${num(out).padStart(10)} kg  yield ${y}%  ${inp && (out/inp>0.35||out/inp<0.12) ? "<-- outside 12-35%" : ""}`)
  } catch {}
}

console.log("\n=== 3. orphans: rows pointing at things that no longer exist ===")
const checks = [
  ["labour_assignments -> attendance_workers", sql`SELECT COUNT(*)::int n FROM labour_assignments a LEFT JOIN attendance_workers w ON w.id=a.worker_id WHERE w.id IS NULL`],
  ["labour_assignments -> account_activities", sql`SELECT COUNT(*)::int n FROM labour_assignments a LEFT JOIN account_activities c ON c.code=a.activity_code AND c.tenant_id=a.tenant_id WHERE c.code IS NULL`],
  ["labor_transactions  -> account_activities", sql`SELECT COUNT(*)::int n FROM labor_transactions l LEFT JOIN account_activities c ON c.code=l.code AND c.tenant_id=l.tenant_id WHERE c.code IS NULL`],
  ["expense_transactions-> account_activities", sql`SELECT COUNT(*)::int n FROM expense_transactions e LEFT JOIN account_activities c ON c.code=e.code AND c.tenant_id=e.tenant_id WHERE c.code IS NULL`],
  ["picking_records     -> attendance_workers", sql`SELECT COUNT(*)::int n FROM picking_records p LEFT JOIN attendance_workers w ON w.id=p.worker_id WHERE w.id IS NULL`],
  ["attendance_records  -> attendance_workers", sql`SELECT COUNT(*)::int n FROM attendance_records a LEFT JOIN attendance_workers w ON w.id=a.worker_id WHERE w.id IS NULL`],
  ["sales_records       -> locations",          sql`SELECT COUNT(*)::int n FROM sales_records s WHERE s.location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.id=s.location_id)`],
  ["expense_transactions-> locations",          sql`SELECT COUNT(*)::int n FROM expense_transactions e WHERE e.location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.id=e.location_id)`],
]
for (const [label, q] of checks) {
  const r = await q
  console.log(`  ${label.padEnd(42)} ${r[0].n === 0 ? "clean" : `*** ${r[0].n} ORPHANS ***`}`)
}

console.log("\n=== 4. negative or impossible money ===")
const neg = [
  ["labor_transactions.total_cost < 0", sql`SELECT COUNT(*)::int n FROM labor_transactions WHERE total_cost < 0`],
  ["expense_transactions.total_amount < 0", sql`SELECT COUNT(*)::int n FROM expense_transactions WHERE total_amount < 0`],
  ["sales_records revenue < 0", sql`SELECT COUNT(*)::int n FROM sales_records WHERE COALESCE(revenue,0) < 0`],
  ["current_inventory.quantity < 0", sql`SELECT COUNT(*)::int n FROM current_inventory WHERE quantity < 0`],
  ["labour_cost.total_cost IS NULL", sql`SELECT COUNT(*)::int n FROM labour_cost WHERE total_cost IS NULL`],
]
for (const [label, q] of neg) {
  const r = await q
  console.log(`  ${label.padEnd(42)} ${r[0].n === 0 ? "clean" : `*** ${r[0].n} ROWS ***`}`)
}
