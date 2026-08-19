/**
 * A depletion has to land on a cost line, and exactly one.
 *
 * Run: node --env-file=.env.local scripts/dev/stock-loss-books-a-cost.mjs   (needs a dev server)
 *
 * The unit tests read the route's source and prove the guard is in the right place. They cannot
 * prove Postgres accepts the insert, that RLS lets app_runtime write expense_transactions from the
 * inventory path, or that the amount matches the weighted average the trigger actually deducted.
 * This walks it for real against dev and then counts rows.
 *
 * Writes: creates one item, one restock, two depletions and an expense, all on Estate Mock, then
 * deletes what it made. It is destructive only to its own rows.
 */
import { chromium } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const ITEM = `ZZ Harness Urea ${Date.now()}`
const sql = neon(process.env.DATABASE_URL_DEV)

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await p.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await p.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await p.click('button[type="submit"]')
for (let i = 0; i < 40 && !/\/dashboard/.test(p.url()); i++) await p.waitForTimeout(500)
if (!/\/dashboard/.test(p.url())) { console.log("login failed"); await b.close(); process.exit(1) }

const post = async (body) => {
  const res = await p.request.post(`${BASE}/api/transactions-neon`, { data: body, timeout: 30000 })
  return { status: res.status(), json: await res.json().catch(() => ({})) }
}

const fail = []
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `  -> ${JSON.stringify(got)} != ${JSON.stringify(want)}`}`)
}

console.log(`\nitem: ${ITEM}\n`)

// 100 kg at Rs 25 -> weighted average Rs 25/kg
await post({ item_type: ITEM, quantity: 100, transaction_type: "restock", price: 25, unit: "kg" })

// 4 kg lost -> expect a Rs 100 cost line under 124
const loss = await post({ item_type: ITEM, quantity: 4, transaction_type: "deplete", unit: "kg", loss_reason: "spillage" })
console.log("── a manual loss books one cost line ──")
check("http", loss.status, 200)
check("amount reported", loss.json?.stock_loss?.amount, 100)
check("not flagged unvalued", loss.json?.stock_loss?.unvalued, false)

const booked = await sql`
  SELECT code, total_amount::float AS amount, notes
  FROM expense_transactions
  WHERE tenant_id = (SELECT tenant_id FROM current_inventory WHERE item_type = ${ITEM} LIMIT 1)
    AND notes ILIKE ${"%" + ITEM + "%"}`
check("rows in expense_transactions", booked.length, 1)
check("code", booked[0]?.code, "124")
check("amount in the DB", booked[0]?.amount, 100)
console.log(`        note: ${booked[0]?.notes}`)

// An expense-originated depletion carries [expense_id:N]; it must not mint a second cost line.
console.log("\n── an expense-driven depletion does not double-book ──")
const viaExpense = await post({
  item_type: ITEM, quantity: 3, transaction_type: "deplete", unit: "kg",
  notes: "Applied to block [expense_id:999999]",
})
check("http", viaExpense.status, 200)
check("no cost line minted", viaExpense.json?.stock_loss, null)
const after = await sql`
  SELECT COUNT(*)::int AS n FROM expense_transactions
  WHERE tenant_id = (SELECT tenant_id FROM current_inventory WHERE item_type = ${ITEM} LIMIT 1)
    AND notes ILIKE ${"%" + ITEM + "%"}`
check("still one cost line", after[0]?.n, 1)

// An item nobody priced values its own loss at zero -- the row is still written, and flagged.
console.log("\n── an unpriced item is flagged, not silently free ──")
const UNPRICED = `ZZ Harness Unpriced ${Date.now()}`
await sql`
  INSERT INTO current_inventory (tenant_id, item_type, quantity, unit, avg_price, location_id)
  VALUES ((SELECT tenant_id FROM current_inventory WHERE item_type = ${ITEM} LIMIT 1), ${UNPRICED}, 50, 'kg', 0, NULL)`
const zero = await post({ item_type: UNPRICED, quantity: 2, transaction_type: "deplete", unit: "kg", loss_reason: "short_count" })
check("http", zero.status, 200)
check("flagged unvalued", zero.json?.stock_loss?.unvalued, true)
check("cost line still written", Number.isInteger(zero.json?.stock_loss?.expenseId), true)

// cleanup
const tid = (await sql`SELECT tenant_id FROM current_inventory WHERE item_type = ${ITEM} LIMIT 1`)[0]?.tenant_id
await sql`DELETE FROM expense_transactions WHERE tenant_id = ${tid} AND (notes ILIKE ${"%" + ITEM + "%"} OR notes ILIKE ${"%" + UNPRICED + "%"})`
await sql`DELETE FROM transaction_history WHERE tenant_id = ${tid} AND item_type IN (${ITEM}, ${UNPRICED})`
await sql`DELETE FROM current_inventory WHERE tenant_id = ${tid} AND item_type IN (${ITEM}, ${UNPRICED})`

await b.close()
console.log(`\n${fail.length ? fail.length + " FAILED" : "all checks passed"}`)
process.exit(fail.length ? 1 : 0)
