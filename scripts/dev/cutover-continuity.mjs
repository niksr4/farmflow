/**
 * A season total must span the cutover: every day counted once, from whichever side owns it.
 *
 * Run: node scripts/dev/cutover-continuity.mjs   (DATABASE_URL exported = production)
 *
 * labour_cost reads typed Accounts rows BEFORE a tenant's assignments_from and muster rows ON
 * OR AFTER it, never both. That is what stops a day being counted twice -- but the same rule
 * would silently drop a day if the boundary were off by one, and a missing day looks exactly
 * like a quiet day. This walks the boundary rather than trusting it.
 */
import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL)
const money = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })
let bad = 0
const ck = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? "ok  " : "FAIL"} ${m}`) }

for (const t of await sql`SELECT id, name FROM tenants ORDER BY name`) {
  const m = await sql`SELECT assignments_from::text d FROM tenant_labour_entry_mode WHERE tenant_id=${t.id}`
  if (!m.length) continue
  const cut = m[0].d.slice(0, 10)
  console.log(`\n=== ${t.name} — cutover ${cut} ===`)

  const legacyBefore = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
    FROM labor_transactions WHERE tenant_id=${t.id} AND deployment_date < ${cut}::date`
  const legacyAfter = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
    FROM labor_transactions WHERE tenant_id=${t.id} AND deployment_date >= ${cut}::date`
  const musterAfter = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
    FROM labour_assignments WHERE tenant_id=${t.id} AND work_date >= ${cut}::date`
  const musterBefore = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
    FROM labour_assignments WHERE tenant_id=${t.id} AND work_date < ${cut}::date`
  const view = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(total_cost),0)::numeric c
    FROM labour_cost WHERE tenant_id=${t.id} AND source <> 'picking'`

  console.log(`  typed, before cutover : ${String(legacyBefore[0].n).padStart(4)} rows ${money(legacyBefore[0].c).padStart(14)}  <- counted`)
  console.log(`  typed, on/after       : ${String(legacyAfter[0].n).padStart(4)} rows ${money(legacyAfter[0].c).padStart(14)}  <- correctly ignored`)
  console.log(`  muster, on/after      : ${String(musterAfter[0].n).padStart(4)} rows ${money(musterAfter[0].c).padStart(14)}  <- counted`)
  console.log(`  muster, before        : ${String(musterBefore[0].n).padStart(4)} rows ${money(musterBefore[0].c).padStart(14)}  <- should be zero`)
  console.log(`  labour_cost total     : ${String(view[0].n).padStart(4)} rows ${money(view[0].c).padStart(14)}`)

  const expect = Number(legacyBefore[0].c) + Number(musterAfter[0].c)
  const expectRows = Number(legacyBefore[0].n) + Number(musterAfter[0].n)
  ck(Math.abs(Number(view[0].c) - expect) < 0.01, `total = before + after, nothing lost or doubled (${money(expect)})`)
  ck(Number(view[0].n) === expectRows, `${view[0].n} rows = ${legacyBefore[0].n} typed + ${musterAfter[0].n} muster`)
  ck(Number(musterBefore[0].n) === 0, "no muster row sits before the cutover, where nothing would count it")

  console.log(`\n  the boundary itself, day by day:`)
  const days = await sql`
    SELECT d::text AS day,
      (SELECT COALESCE(SUM(total_cost),0) FROM labour_cost lc WHERE lc.tenant_id=${t.id} AND lc.work_date=d AND lc.source<>'picking') AS counted,
      (SELECT COALESCE(SUM(total_cost),0) FROM labor_transactions lt WHERE lt.tenant_id=${t.id} AND lt.deployment_date=d) AS typed,
      (SELECT COALESCE(SUM(total_cost),0) FROM labour_assignments la WHERE la.tenant_id=${t.id} AND la.work_date=d) AS muster
    FROM generate_series(${cut}::date - 3, ${cut}::date + 2, '1 day') d`
  for (const r of days) {
    const side = r.day.slice(0,10) < cut ? "typed" : "muster"
    const src = side === "typed" ? Number(r.typed) : Number(r.muster)
    const ok = Math.abs(Number(r.counted) - src) < 0.01
    if (!ok) bad++
    console.log(`    ${r.day.slice(0,10)}  counted ${money(r.counted).padStart(12)}  from ${side.padEnd(6)} ${money(src).padStart(12)}  ${ok ? "ok" : "MISMATCH"}`)
  }
}
console.log(bad === 0 ? "\nPASS — totals are continuous across the cutover\n" : `\n${bad} PROBLEM(S)\n`)
process.exit(bad === 0 ? 0 : 1)
