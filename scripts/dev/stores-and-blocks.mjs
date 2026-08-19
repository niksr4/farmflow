/**
 * A store is never offered where a block belongs, and stock never sits on a block.
 *
 * Run: node --env-file=.env.local scripts/dev/stores-and-blocks.mjs
 *
 * scripts/128 made both a row in `locations`, which is cheap but means one careless query can
 * offer someone the shed as a place to have spent a day's labour. Every picker defaults to
 * blocks; only the settings page and the dashboard's master fetch ask for both.
 */
import { neon } from "@neondatabase/serverless"
import { chromium } from "@playwright/test"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
let fail = 0
const check = (ok, msg) => { if (!ok) fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await p.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await p.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await p.click('button[type="submit"]')
for (let i = 0; i < 40 && !/\/dashboard/.test(p.url()); i++) await p.waitForTimeout(500)

const get = async (qs) => (await (await p.request.get(`${BASE}/api/locations${qs}`)).json()).locations || []

console.log("\n== the default is blocks, because every picker in the app means a block ==")
const def = await get("")
check(def.length > 0, `${def.length} returned`)
check(def.every((l) => (l.kind ?? "block") === "block"), "not one of them is a store")

console.log("\n== ?kind=store returns only the shed ==")
const stores = await get("?kind=store")
check(stores.length === 1, `${stores.length} store`)
check(stores.every((l) => l.kind === "store"), `named "${stores[0]?.name}"`)

console.log("\n== ?kind=all returns both, for the settings page ==")
const all = await get("?scope=all&kind=all")
check(all.length === def.length + stores.length, `${all.length} = ${def.length} blocks + ${stores.length} store`)

console.log("\n== stock lives in the store, never on a block ==")
const bad = await sql`SELECT COUNT(*)::int n FROM current_inventory ci
  LEFT JOIN locations l ON l.id = ci.location_id
  WHERE ci.tenant_id=${T} AND (l.id IS NULL OR l.kind <> 'store')`
check(Number(bad[0].n) === 0, `${bad[0].n} balances outside the store`)
const dupes = await sql`SELECT COUNT(*)::int n FROM (
  SELECT item_type, unit FROM current_inventory WHERE tenant_id=${T}
  GROUP BY item_type, unit HAVING COUNT(*) > 1) d`
check(Number(dupes[0].n) === 0, `${dupes[0].n} items holding more than one balance`)

console.log("\n== a store cannot be picked as the place work happened ==")
const store = stores[0]
if (store) {
  const w = (await sql`SELECT id FROM attendance_workers WHERE tenant_id=${T} AND active LIMIT 1`)[0]
  const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code
  const offered = def.some((l) => l.id === store.id)
  check(!offered, "the muster's block list does not contain the store")
}

console.log(fail === 0 ? "\nPASS -- blocks and stores stay in their own lanes\n" : `\n${fail} FAILURE(S)\n`)
await b.close()
process.exit(fail === 0 ? 0 : 1)
