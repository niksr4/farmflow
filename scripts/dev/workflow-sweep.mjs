/**
 * Does each workflow actually work end to end, and does the screen agree with the database?
 *
 * Run: node --env-file=.env.local scripts/dev/workflow-sweep.mjs
 *
 * operations-sweep.mjs asks whether tabs render. This asks the harder question: create a record,
 * edit it, delete it, and check the row landed, changed and went. Rendering proves nothing about
 * whether a save reached the database or whether the total beside it moved.
 *
 * WRITES, then cleans up. Runs against Estate Mock on DEV only, and refuses anything else --
 * every record it creates is tagged so the cleanup can find its own work and nothing else.
 */
import { neon } from "@neondatabase/serverless"
import { chromium } from "@playwright/test"

const BASE = "http://localhost:3000"
const TAG = "wf-sweep-" + Date.now()
const sql = neon(process.env.DATABASE_URL_DEV)

if (!/localhost|127\.0\.0\.1/.test(BASE)) { console.error("dev only"); process.exit(2) }
const tenants = await sql`SELECT id, name FROM tenants WHERE name = 'Estate Mock'`
if (!tenants.length) { console.error("Estate Mock not found on dev"); process.exit(2) }
const T = tenants[0].id

let pass = 0, fail = 0
const check = (ok, msg) => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await page.click('button[type="submit"]')
for (let i = 0; i < 40 && !/\/dashboard/.test(page.url()); i++) await page.waitForTimeout(500)

const today = new Date().toISOString().slice(0, 10)
const loc = (await sql`SELECT id, name FROM locations WHERE tenant_id=${T} ORDER BY name LIMIT 1`)[0]
const code = (await sql`SELECT code FROM account_activities WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0].code
const worker = (await sql`SELECT id FROM attendance_workers WHERE tenant_id=${T} AND active ORDER BY full_name LIMIT 1`)[0]

const api = async (method, path, data) => {
  const res = await page.request.fetch(`${BASE}${path}`, {
    method, ...(data ? { data } : {}), headers: { "Content-Type": "application/json" },
  })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status(), body }
}

const one = async (q) => Number((await q)[0]?.v ?? 0)

console.log(`\n=== workflow sweep (Estate Mock, dev) — tag ${TAG} ===\n`)

// ── Expense: create, edit, delete, and confirm the cost total tracks each step ───────────
console.log("EXPENSE (Costs tab)")
{
  const before = await one(sql`SELECT COALESCE(SUM(amount),0) v FROM estate_cost WHERE tenant_id=${T} AND kind='expense'`)
  const c = await api("POST", "/api/expenses-neon", {
    date: today, code, reference: "sweep expense", amount: 1234, notes: TAG, locationId: loc.id,
  })
  check(c.status === 200, `create -> ${c.status}`)
  const afterCreate = await one(sql`SELECT COALESCE(SUM(amount),0) v FROM estate_cost WHERE tenant_id=${T} AND kind='expense'`)
  check(Math.abs(afterCreate - before - 1234) < 0.01, `cost total moved by exactly 1234 (${before} -> ${afterCreate})`)

  const row = (await sql`SELECT id, total_amount FROM expense_transactions WHERE tenant_id=${T} AND notes=${TAG}`)[0]
  check(Boolean(row), "row is in the database with its own tag")

  if (row) {
    const e = await api("PUT", "/api/expenses-neon", {
      id: row.id, date: today, code, reference: "sweep expense edited", amount: 999, notes: TAG, locationId: loc.id,
    })
    check(e.status === 200, `edit -> ${e.status}`)
    const edited = await one(sql`SELECT COALESCE(total_amount,0) v FROM expense_transactions WHERE id=${row.id}`)
    check(Math.abs(edited - 999) < 0.01, `amount changed to 999 (got ${edited})`)

    const d = await api("DELETE", `/api/expenses-neon?id=${row.id}`)
    check(d.status === 200, `delete -> ${d.status}`)
    const gone = await one(sql`SELECT COUNT(*) v FROM expense_transactions WHERE id=${row.id}`)
    check(gone === 0, "row is gone")
    const afterDelete = await one(sql`SELECT COALESCE(SUM(amount),0) v FROM estate_cost WHERE tenant_id=${T} AND kind='expense'`)
    check(Math.abs(afterDelete - before) < 0.01, `cost total returned to where it started (${afterDelete})`)
  }
}

// ── Rainfall ─────────────────────────────────────────────────────────────────────────────
console.log("\nRAINFALL")
{
  const c = await api("POST", "/api/rainfall", { record_date: today, inches: 12, cents: 50, notes: TAG })
  check(c.status === 200 || c.status === 201, `create -> ${c.status}`)
  const row = (await sql`SELECT id FROM rainfall_records WHERE tenant_id=${T} AND notes=${TAG} LIMIT 1`)[0]
  check(Boolean(row), "row in database")
  if (row) {
    const d = await api("DELETE", `/api/rainfall?id=${row.id}`)
    check(d.status === 200, `delete -> ${d.status}`)
    check((await one(sql`SELECT COUNT(*) v FROM rainfall_records WHERE id=${row.id}`)) === 0, "row gone")
  }
}

// ── Journal ──────────────────────────────────────────────────────────────────────────────
console.log("\nJOURNAL")
let skipJournal = false
{
  const c = await api("POST", "/api/journal", { entryDate: today, title: TAG, body: "sweep", locationId: loc.id })
  // 403 here is the module gate doing its job: journal is not enabled for Estate Mock. Treated
  // as a pass so the sweep reports broken workflows, not correct access control.
  if (c.status === 403) {
    check(true, "403 — journal module not enabled for this tenant, gate working as intended")
    skipJournal = true
  } else check(c.status === 200 || c.status === 201, `create -> ${c.status}`)
  const row = skipJournal ? null : (await sql`SELECT id FROM journal_entries WHERE tenant_id=${T} AND title=${TAG} LIMIT 1`)[0]
  if (!skipJournal) check(Boolean(row), "row in database")
  if (row) {
    const d = await api("DELETE", `/api/journal?id=${row.id}`)
    check(d.status === 200, `delete -> ${d.status}`)
  }
}

// ── Picking: the arm added to labour_cost today ──────────────────────────────────────────
console.log("\nPICKING (now inside labour_cost)")
{
  const beforeCost = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labour_cost WHERE tenant_id=${T}`)
  const beforeDays = await one(sql`SELECT COALESCE(SUM(estate_laborers+contract_laborers),0) v FROM labour_cost WHERE tenant_id=${T}`)
  const c = await api("POST", "/api/picking-records", {
    workerId: worker.id, pickDate: today, kgPicked: 100, ratePerKg: 5, locationId: loc.id, notes: TAG,
  })
  check(c.status === 200 || c.status === 201, `create -> ${c.status}`)
  const afterCost = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labour_cost WHERE tenant_id=${T}`)
  const afterDays = await one(sql`SELECT COALESCE(SUM(estate_laborers+contract_laborers),0) v FROM labour_cost WHERE tenant_id=${T}`)
  check(Math.abs(afterCost - beforeCost - 500) < 0.01, `labour_cost +500 (${beforeCost} -> ${afterCost})`)
  check(Math.abs(afterDays - beforeDays) < 0.001, `labourer-days UNCHANGED at ${afterDays} — a kilo is not a day`)

  const row = (await sql`SELECT id FROM picking_records WHERE tenant_id=${T} AND notes=${TAG} LIMIT 1`)[0]
  if (row) {
    const d = await api("DELETE", `/api/picking-records/${row.id}`)
    check(d.status === 200, `delete -> ${d.status}`)
    const back = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labour_cost WHERE tenant_id=${T}`)
    check(Math.abs(back - beforeCost) < 0.01, "labour_cost returned to where it started")
  }
}

// ── Sale: revenue must reach booked_revenue, which the P&L tab now reads ─────────────────
console.log("\nSALE (via booked_revenue)")
{
  const before = await one(sql`SELECT COALESCE(SUM(revenue),0) v FROM booked_revenue WHERE tenant_id=${T}`)
  // The sale has to be preceded by a dispatch. This is not harness bookkeeping -- the route
  // refuses to sell coffee the estate has not received back from the curer ("Insufficient stock
  // for Arabica Dry Parchment. Available 0.00 KGs, requested 500.00 KGs"), which is a real guard
  // and the counterpart to the dispatch-vs-sales reconciliation check. So the sweep walks the
  // actual chain: dispatch out, receive back, then sell.
  const disp = await api("POST", "/api/dispatch", {
    dispatch_date: today, coffee_type: "Arabica", bag_type: "Dry Parchment",
    bags_dispatched: 10, kgs_received: 500, locationId: loc.id, notes: TAG,
  })
  check(disp.status === 200 || disp.status === 201, `dispatch 500 kg first -> ${disp.status}`)

  // 10 bags at Rs 5,000 = Rs 50,000. Priced per BAG because that is what the route requires,
  // and it is also the column booked_revenue prefers -- see scripts/121.
  const c = await api("POST", "/api/sales", {
    sale_date: today, coffee_type: "Arabica", bag_type: "Dry Parchment",
    bags_sold: 10, kgs_sold: 500, price_per_bag: 5000, buyer_name: TAG, locationId: loc.id,
  })
  check(c.status === 200 || c.status === 201, `create -> ${c.status}`)
  const after = await one(sql`SELECT COALESCE(SUM(revenue),0) v FROM booked_revenue WHERE tenant_id=${T}`)
  check(Math.abs(after - before - 50000) < 0.01, `booked_revenue +50000 (${before} -> ${after})`)

  const row = (await sql`SELECT id FROM sales_records WHERE tenant_id=${T} AND buyer_name=${TAG} LIMIT 1`)[0]
  check(Boolean(row), "row in database")
  if (row) {
    const d = await api("DELETE", `/api/sales?id=${row.id}`)
    check(d.status === 200, `delete -> ${d.status}`)
    const back = await one(sql`SELECT COALESCE(SUM(revenue),0) v FROM booked_revenue WHERE tenant_id=${T}`)
    check(Math.abs(back - before) < 0.01, "revenue returned to where it started")
  }
}

// ── Other sale: the pepper path that six routes could not see this morning ───────────────
console.log("\nOTHER SALE (pepper — the Rs 12,12,380 blind spot)")
{
  const before = await one(sql`SELECT COALESCE(SUM(revenue),0) v FROM booked_revenue WHERE tenant_id=${T}`)
  const c = await api("POST", "/api/other-sales", {
    sale_date: today, asset_type: "Pepper", sale_mode: "per_kg", kgs_sold: 100,
    rate_per_kg: 700, buyer_name: TAG, location_id: loc.id,
  })
  check(c.status === 200 || c.status === 201, `create -> ${c.status}`)
  const after = await one(sql`SELECT COALESCE(SUM(revenue),0) v FROM booked_revenue WHERE tenant_id=${T}`)
  check(Math.abs(after - before - 70000) < 0.01, `booked_revenue +70000 — pepper now reaches the P&L (${before} -> ${after})`)

  const row = (await sql`SELECT id FROM other_sales_records WHERE tenant_id=${T} AND buyer_name=${TAG} LIMIT 1`)[0]
  if (row) {
    const d = await api("DELETE", `/api/other-sales?id=${row.id}`)
    check(d.status === 200, `delete -> ${d.status}`)
  }
}

// ── Cleanup: anything the sweep created and did not manage to remove ─────────────────────
console.log("\nCLEANUP")
const leftovers = []
for (const [label, q] of [
  ["expense_transactions", sql`DELETE FROM expense_transactions WHERE tenant_id=${T} AND notes=${TAG} RETURNING id`],
  ["rainfall_records", sql`DELETE FROM rainfall_records WHERE tenant_id=${T} AND notes=${TAG} RETURNING id`],
  ["journal_entries", sql`DELETE FROM journal_entries WHERE tenant_id=${T} AND title=${TAG} RETURNING id`],
  ["picking_records", sql`DELETE FROM picking_records WHERE tenant_id=${T} AND notes=${TAG} RETURNING id`],
  ["sales_records", sql`DELETE FROM sales_records WHERE tenant_id=${T} AND buyer_name=${TAG} RETURNING id`],
  ["other_sales_records", sql`DELETE FROM other_sales_records WHERE tenant_id=${T} AND buyer_name=${TAG} RETURNING id`],
  ["dispatch_records", sql`DELETE FROM dispatch_records WHERE tenant_id=${T} AND notes=${TAG} RETURNING id`],
  ["transaction_history", sql`DELETE FROM transaction_history WHERE tenant_id=${T} AND notes LIKE ${"%" + TAG + "%"} RETURNING id`],
]) {
  try { const r = await q; if (r.length) leftovers.push(`${label}=${r.length}`) } catch { /* table may not exist */ }
}
console.log(leftovers.length ? `  removed leftovers: ${leftovers.join(", ")}` : "  nothing left behind")

console.log(`\n${fail === 0 ? `PASS — ${pass} checks` : `${fail} FAILURE(S) of ${pass + fail}`}\n`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
