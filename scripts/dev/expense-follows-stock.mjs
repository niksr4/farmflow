/**
 * An expense that consumes stock is worth what the stock cost, not what someone typed.
 *
 * Run: node --env-file=.env.local scripts/dev/expense-follows-stock.mjs
 *
 * Before this, the typed amount went to the P&L and the depletion's own value went to the ledger,
 * and nothing reconciled them. Price is captured once at restock; usage is a quantity.
 */
import { neon } from "@neondatabase/serverless"
import { chromium } from "@playwright/test"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const TAG = "stockcost-" + Date.now()
const ITEM = "Sweep Urea " + Date.now()
let fail = 0
const check = (ok, m) => { if (!ok) fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${m}`) }

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await p.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await p.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await p.click('button[type="submit"]')
for (let i = 0; i < 40 && !/\/dashboard/.test(p.url()); i++) await p.waitForTimeout(500)

const store = (await sql`SELECT id FROM locations WHERE tenant_id=${T} AND kind='store' LIMIT 1`)[0]
const block = (await sql`SELECT id FROM locations WHERE tenant_id=${T} AND kind='block' ORDER BY name LIMIT 1`)[0]
const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code
const today = new Date().toISOString().slice(0, 10)

console.log("\n== 1. stock arrives WITH a price: 1,000 kg for Rs 30,000 ==")
const stocked = await p.request.post(`${BASE}/api/inventory-neon`, {
  data: { item_type: ITEM, quantity: 1000, unit: "kg", price: 30, notes: TAG, location_id: store.id },
})
check(stocked.status() === 200 || stocked.status() === 201, `restocked -> ${stocked.status()}`)
const held = await sql`SELECT quantity, avg_price FROM current_inventory WHERE tenant_id=${T} AND item_type=${ITEM}`
check(Number(held[0]?.avg_price) === 30, `average cost Rs ${held[0]?.avg_price}/kg`)

console.log("\n== 2. using 500 kg is worth Rs 15,000 -- whatever amount is sent ==")
const used = await p.request.post(`${BASE}/api/expenses-neon`, {
  data: { date: today, code, amount: 999, notes: TAG, locationId: block.id,
          inventoryItems: [{ itemType: ITEM, quantity: 500 }] },
})
check(used.status() === 200, `expense saved -> ${used.status()}`)
const row = (await sql`SELECT id, total_amount, location_id FROM expense_transactions WHERE tenant_id=${T} AND notes=${TAG}`)[0]
check(Number(row?.total_amount) === 15000, `expense is Rs ${Number(row?.total_amount).toLocaleString("en-IN")} — 500 x Rs 30, not the Rs 999 sent`)
check(String(row?.location_id) === String(block.id), "and it carries the BLOCK, which is where per-block input cost comes from")

console.log("\n== 3. the ledger agrees with the expense, which was the whole problem ==")
const dep = await sql`SELECT quantity, total_cost FROM transaction_history
  WHERE tenant_id=${T} AND item_type=${ITEM} AND LOWER(transaction_type)='deplete'`
check(Number(dep[0]?.total_cost) === 15000, `depletion valued at Rs ${Number(dep[0]?.total_cost).toLocaleString("en-IN")} — the same number`)
const left = await sql`SELECT quantity FROM current_inventory WHERE tenant_id=${T} AND item_type=${ITEM}`
check(Number(left[0]?.quantity) === 500, `500 kg left in the store`)

console.log("\n== 4. an expense with no stock keeps its typed amount ==")
const plain = await p.request.post(`${BASE}/api/expenses-neon`, {
  data: { date: today, code, amount: 4321, notes: TAG + "-plain", locationId: block.id },
})
check(plain.status() === 200, `saved -> ${plain.status()}`)
const prow = (await sql`SELECT total_amount FROM expense_transactions WHERE tenant_id=${T} AND notes=${TAG + "-plain"}`)[0]
check(Number(prow?.total_amount) === 4321, `still Rs ${Number(prow?.total_amount).toLocaleString("en-IN")} — electricity and transport are not stock`)

await sql`DELETE FROM expense_transactions WHERE tenant_id=${T} AND notes LIKE ${TAG + "%"}`
await sql`DELETE FROM transaction_history WHERE tenant_id=${T} AND item_type=${ITEM}`
await sql`DELETE FROM current_inventory WHERE tenant_id=${T} AND item_type=${ITEM}`
console.log(fail === 0 ? "\nPASS — the expense follows the stock, and the ledger agrees\n" : `\n${fail} FAILURE(S)\n`)
await b.close()
process.exit(fail === 0 ? 0 : 1)
