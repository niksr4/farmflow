/**
 * A block can be removed only if nothing was ever recorded against it.
 *
 * Run: node --env-file=.env.local scripts/dev/location-delete.mjs
 *
 * The guard is not politeness. processing_records and pepper_records are ON DELETE CASCADE, so
 * deleting a used block would take real harvest records with it, and picking_records carries a
 * location_id with no foreign key at all -- those would simply be left pointing at nothing.
 */
import { neon } from "@neondatabase/serverless"
import { chromium } from "@playwright/test"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const TAG = "Sweep Block " + Date.now()
let fail = 0
const check = (ok, msg) => { if (!ok) fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await p.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await p.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await p.click('button[type="submit"]')
for (let i = 0; i < 40 && !/\/dashboard/.test(p.url()); i++) await p.waitForTimeout(500)

console.log("\n== 1. an unused block can be removed ==")
const made = await p.request.post(`${BASE}/api/locations`, { data: { name: TAG, code: "SWEEP-DEL" } })
check(made.status() === 200 || made.status() === 201, `created a throwaway block -> ${made.status()}`)
const fresh = (await sql`SELECT id FROM locations WHERE tenant_id=${T} AND name=${TAG}`)[0]
check(Boolean(fresh), "it is in the database")
const del = await p.request.delete(`${BASE}/api/locations?id=${fresh.id}`)
check(del.status() === 200, `deleted -> ${del.status()}`)
check((await sql`SELECT COUNT(*)::int n FROM locations WHERE id=${fresh.id}`)[0].n === 0, "and it is gone")

console.log("\n== 2. a block with HARVEST records is refused, and the records survive ==")
const used = (await sql`SELECT l.id, l.name, COUNT(pr.id)::int n FROM locations l
  JOIN processing_records pr ON pr.location_id = l.id
  WHERE l.tenant_id=${T} GROUP BY l.id, l.name ORDER BY n DESC LIMIT 1`)[0]
if (used) {
  const before = Number((await sql`SELECT COUNT(*)::int n FROM processing_records WHERE location_id=${used.id}`)[0].n)
  const res = await p.request.delete(`${BASE}/api/locations?id=${used.id}`)
  const body = await res.json().catch(() => ({}))
  check(res.status() === 409, `refused "${used.name}" -> ${res.status()}`)
  check(/processing records/i.test(body.error || ""), `names what is using it: "${String(body.error).slice(0, 90)}..."`)
  const after = Number((await sql`SELECT COUNT(*)::int n FROM processing_records WHERE location_id=${used.id}`)[0].n)
  check(after === before && before > 0, `all ${before} processing records still there — the CASCADE never fired`)
  check((await sql`SELECT COUNT(*)::int n FROM locations WHERE id=${used.id}`)[0].n === 1, "the block itself survived")
} else {
  console.log("  (no block with processing records on this tenant — seeding one)")
  const l = (await sql`SELECT id, name FROM locations WHERE tenant_id=${T} ORDER BY name LIMIT 1`)[0]
  await sql`INSERT INTO processing_records (tenant_id, location_id, process_date, crop_today, coffee_type)
            VALUES (${T}, ${l.id}, CURRENT_DATE, 100, 'Arabica')`
  const res = await p.request.delete(`${BASE}/api/locations?id=${l.id}`)
  const body = await res.json().catch(() => ({}))
  check(res.status() === 409, `refused "${l.name}" -> ${res.status()}`)
  check(/processing records/i.test(body.error || ""), `names what is using it: "${String(body.error).slice(0, 90)}..."`)
  check(Number((await sql`SELECT COUNT(*)::int n FROM processing_records WHERE location_id=${l.id}`)[0].n) > 0,
    "the harvest record survived the attempt")
  await sql`DELETE FROM processing_records WHERE tenant_id=${T} AND location_id=${l.id} AND crop_today=100`
}

console.log("\n== 3. a block used only by the muster is refused too ==")
const w = (await sql`SELECT id FROM attendance_workers WHERE tenant_id=${T} AND active LIMIT 1`)[0]
const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code
const l2 = await p.request.post(`${BASE}/api/locations`, { data: { name: TAG + " M", code: "SWEEP-M" } })
const fresh2 = (await sql`SELECT id FROM locations WHERE tenant_id=${T} AND name=${TAG + " M"}`)[0]
const cut = (await sql`SELECT COALESCE(MAX(assignments_from), CURRENT_DATE)::text v FROM tenant_labour_entry_mode WHERE tenant_id=${T}`)[0].v.slice(0,10)
await sql`INSERT INTO labour_assignments (tenant_id, worker_id, work_date, activity_code, location_id, headcount, day_fraction, rate)
          VALUES (${T}, ${w.id}, ${cut}::date, ${code}, ${fresh2.id}, 1, 1, 600)`
const res3 = await p.request.delete(`${BASE}/api/locations?id=${fresh2.id}`)
const body3 = await res3.json().catch(() => ({}))
check(res3.status() === 409, `refused -> ${res3.status()}`)
check(/muster/i.test(body3.error || ""), `names the muster: "${String(body3.error).slice(0, 80)}..."`)
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND location_id=${fresh2.id}`
const res4 = await p.request.delete(`${BASE}/api/locations?id=${fresh2.id}`)
check(res4.status() === 200, `once the muster entry is gone, so can the block be -> ${res4.status()}`)

await sql`DELETE FROM locations WHERE tenant_id=${T} AND name LIKE ${'Sweep Block%'}`
console.log(fail === 0 ? "\nPASS — unused blocks go, used ones are protected with their records\n" : `\n${fail} FAILURE(S)\n`)
await b.close()
process.exit(fail === 0 ? 0 : 1)
