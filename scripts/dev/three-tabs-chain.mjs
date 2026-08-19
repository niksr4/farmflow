/**
 * Inventory, Muster and Costs are one chain. This walks it.
 *
 * Run: node --env-file=.env.local scripts/dev/three-tabs-chain.mjs
 *
 * Stock arrives in a store with a price. It is used on a block through an expense, which values
 * itself from that price. Labour is allocated to the same block on the muster. Both land in
 * estate_cost, both carry the block, and the block's total is the sum of the two -- with nothing
 * counted twice and nothing counted nowhere, which are the only two ways this can go wrong.
 */
import { neon } from "@neondatabase/serverless"
import { chromium } from "@playwright/test"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const TAG = "chain-" + Date.now()
const ITEM = "Chain Urea " + Date.now()
let fail = 0
const money = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN")
const check = (ok, m) => { if (!ok) fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${m}`) }
const one = async (q) => Number((await q)[0]?.v ?? 0)

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await p.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await p.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await p.click('button[type="submit"]')
for (let i = 0; i < 40 && !/\/dashboard/.test(p.url()); i++) await p.waitForTimeout(500)

const store = (await sql`SELECT id, name FROM locations WHERE tenant_id=${T} AND kind='store' LIMIT 1`)[0]
const block = (await sql`SELECT id, name FROM locations WHERE tenant_id=${T} AND kind='block' ORDER BY name LIMIT 1`)[0]
const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code
const worker = (await sql`SELECT id, daily_rate FROM attendance_workers WHERE tenant_id=${T} AND active ORDER BY full_name LIMIT 1`)[0]
const cutover = (await sql`SELECT assignments_from::text v FROM tenant_labour_entry_mode WHERE tenant_id=${T}`)[0]?.v?.slice(0,10)
const day = cutover && cutover <= new Date().toISOString().slice(0,10) ? new Date().toISOString().slice(0,10) : cutover
await sql`UPDATE attendance_workers SET daily_rate=COALESCE(daily_rate,600) WHERE tenant_id=${T}`

const costBefore = await one(sql`SELECT COALESCE(SUM(amount),0) v FROM estate_cost WHERE tenant_id=${T}`)
const blockBefore = await one(sql`SELECT COALESCE(SUM(amount),0) v FROM estate_cost WHERE tenant_id=${T} AND location_id=${block.id}`)

console.log(`\nstore "${store.name}"  ->  block "${block.name}"\n`)

console.log("== INVENTORY: 1,000 kg arrives at Rs 30, into the store ==")
const r1 = await p.request.post(`${BASE}/api/inventory-neon`, {
  data: { item_type: ITEM, quantity: 1000, unit: "kg", price: 30, notes: TAG, location_id: store.id },
})
check(r1.status() === 200 || r1.status() === 201, `restocked -> ${r1.status()}`)
const held = await sql`SELECT quantity, avg_price, location_id FROM current_inventory WHERE tenant_id=${T} AND item_type=${ITEM}`
check(Number(held[0]?.avg_price) === 30, `average cost ${money(30)}/kg`)
check(String(held[0]?.location_id) === String(store.id), "the balance sits in the STORE, not a block")

console.log("\n== COSTS: 400 kg used on the block, amount not typed ==")
const r2 = await p.request.post(`${BASE}/api/expenses-neon`, {
  data: { date: day, code, amount: 1, notes: TAG, locationId: block.id,
          inventoryItems: [{ itemType: ITEM, quantity: 400 }] },
})
check(r2.status() === 200, `expense -> ${r2.status()}`)
const exp = (await sql`SELECT total_amount, location_id FROM expense_transactions WHERE tenant_id=${T} AND notes=${TAG}`)[0]
check(Number(exp?.total_amount) === 12000, `valued at ${money(exp?.total_amount)} = 400 x Rs 30, ignoring the Rs 1 sent`)
check(String(exp?.location_id) === String(block.id), "and it carries the BLOCK")
check(await one(sql`SELECT COALESCE(quantity,0) v FROM current_inventory WHERE tenant_id=${T} AND item_type=${ITEM}`) === 600,
  "600 kg left in the store — inventory moved because Costs said so")

console.log("\n== MUSTER: a day's labour on the same block ==")
await p.request.put(`${BASE}/api/attendance`, { data: { date: day, presentWorkerIds: [worker.id] } })
const r3 = await p.request.post(`${BASE}/api/attendance/assignments`, {
  data: { date: day, workerIds: [worker.id], activityCode: code, locationId: block.id, dayFraction: 1 },
})
check(r3.status() === 200, `allocated -> ${r3.status()}`)
const lab = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labour_assignments
  WHERE tenant_id=${T} AND work_date=${day}::date AND location_id=${block.id}`)
check(lab > 0, `labour ${money(lab)} on the block`)

console.log("\n== THE THREE MEET IN estate_cost ==")
const costAfter = await one(sql`SELECT COALESCE(SUM(amount),0) v FROM estate_cost WHERE tenant_id=${T}`)
check(Math.abs(costAfter - costBefore - 12000 - lab) < 0.01,
  `total moved by exactly ${money(12000 + lab)} — the materials plus the labour, nothing else`)

const kinds = await sql`SELECT kind, COALESCE(SUM(amount),0)::numeric v FROM estate_cost
  WHERE tenant_id=${T} AND location_id=${block.id} GROUP BY kind ORDER BY kind`
console.log("  the block now carries:", kinds.map((k) => `${k.kind} ${money(k.v)}`).join(" + "))
const blockAfter = await one(sql`SELECT COALESCE(SUM(amount),0) v FROM estate_cost WHERE tenant_id=${T} AND location_id=${block.id}`)
check(Math.abs(blockAfter - blockBefore - 12000 - lab) < 0.01,
  `cost per block works: ${money(blockAfter - blockBefore)} attributed to "${block.name}"`)

console.log("\n== nothing counted twice ==")
const dep = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM transaction_history
  WHERE tenant_id=${T} AND item_type=${ITEM} AND LOWER(transaction_type)='deplete'`)
check(dep === 12000, `the depletion agrees with the expense at ${money(dep)} — same money, one number`)
const invInCost = await one(sql`SELECT COUNT(*) v FROM estate_cost WHERE tenant_id=${T} AND source='inventory'`)
check(invInCost === 0, "stock movements are NOT a cost line — the expense already is one")

await sql`DELETE FROM labour_assignments WHERE tenant_id=${T} AND work_date=${day}::date AND location_id=${block.id}`
await sql`DELETE FROM expense_transactions WHERE tenant_id=${T} AND notes=${TAG}`
await sql`DELETE FROM transaction_history WHERE tenant_id=${T} AND item_type=${ITEM}`
await sql`DELETE FROM current_inventory WHERE tenant_id=${T} AND item_type=${ITEM}`
console.log(fail === 0 ? "\nPASS — stock, labour and spend are one chain\n" : `\n${fail} FAILURE(S)\n`)
await b.close()
process.exit(fail === 0 ? 0 : 1)
