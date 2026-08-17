/**
 * Rates and block areas for the Medappa Dev Copy, so a demo can show the whole chain.
 *
 * Run: node --env-file=.env.local scripts/dev/medappa-demo-setup.mjs
 *
 * DEV COPY ONLY, and invented. In production the estate sets both itself: a daily rate is payroll
 * and an acreage is a fact about the land, and neither is ours to guess. This exists so the
 * cost-per-acre figures have something to divide by during a demo, not as data anybody should
 * ever rely on.
 *
 * Two blocks state their acreage in their own name -- "2.5 Acre Bit", "4 Acre Bit" -- so those
 * are read rather than overwritten. The name is data.
 */

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Medappa Dev Copy'`)[0].id

// Seeded so a re-run gives the same estate rather than reshuffling it mid-conversation.
let seed = 20260817
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]

// Their own labour history: Permanent 600, Under Lopping 600, Shade Lopping 800, Outside 1000.
// Weighted towards 600 because that is what most of their entries actually paid.
const RATES = [550, 600, 600, 600, 600, 650, 700, 750, 800, 800, 900, 1000]

console.log("== daily rates ==")
const workers = await sql`SELECT id, full_name FROM attendance_workers WHERE tenant_id=${T} AND active ORDER BY full_name`
for (const w of workers) {
  const rate = pick(RATES)
  await sql`UPDATE attendance_workers SET daily_rate=${rate} WHERE id=${w.id}`
  console.log(`  ${String(w.full_name).padEnd(20)} Rs ${rate}/day`)
}

console.log("\n== block areas ==")
const blocks = await sql`SELECT id, name, estate FROM locations WHERE tenant_id=${T} ORDER BY estate, name`
for (const b of blocks) {
  // "Citrus Grove - 2.5 Acre Bit" already says how big it is.
  const stated = /(\d+(?:\.\d+)?)\s*acre/i.exec(b.name)
  const acres = stated
    ? Number(stated[1])
    : b.estate === "Citrus Grove"
      ? Math.round((3 + rand() * 4) * 10) / 10   // the C/D grid blocks are the smaller ones
      : Math.round((5 + rand() * 7) * 10) / 10   // Tirtha's named blocks run larger
  await sql`UPDATE locations SET area_acres=${acres} WHERE id=${b.id}`
  console.log(`  ${String(b.name).padEnd(34)} ${acres} acres${stated ? "   <- taken from the name" : ""}`)
}

const total = await sql`
  SELECT estate, ROUND(SUM(area_acres)::numeric, 1) acres, COUNT(*)::int n
  FROM locations WHERE tenant_id=${T} GROUP BY estate ORDER BY estate`
console.log("\n== planted area ==")
total.forEach((r) => console.log(`  ${String(r.estate).padEnd(14)} ${r.n} blocks, ${r.acres} acres`))
const rated = await sql`
  SELECT COUNT(*) FILTER (WHERE daily_rate IS NOT NULL)::int r, COUNT(*)::int n
  FROM attendance_workers WHERE tenant_id=${T} AND active`
console.log(`  ${rated[0].r}/${rated[0].n} workers have a rate -- allocation will no longer be refused`)
