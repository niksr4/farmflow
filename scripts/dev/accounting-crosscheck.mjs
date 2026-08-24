/**
 * Do the tabs agree about how much an estate spent? Read-only.
 *
 * Run: node --env-file=.env.local scripts/dev/accounting-crosscheck.mjs [prod]
 *
 * Each tab computes its own total from its own query. Nothing forces them to agree, so this
 * runs each one's aggregation over the identical tenant and window and lines the answers up.
 * A disagreement is either a double count or something a total is failing to see -- both are
 * the same bug from the estate's side, which is that the number on screen is not the truth.
 */
import { neon } from "@neondatabase/serverless"
const isProd = process.argv[2] === "prod"
const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)
const money = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })

/**
 * The Indian fiscal year containing today, computed rather than typed.
 *
 * It was hardcoded to 2025-04-01..2026-03-31, which stopped being the current year on 2026-04-01.
 * Run in August 2026 it audited a closed year and reported "of which created by expense: Rs 0" for
 * HoneyFarm -- true of that window, and completely misleading, because every expense-linked
 * depletion they have was written after the linkage shipped and therefore falls in *this* year.
 * A checking tool quietly checking the wrong period is the same defect class it exists to catch.
 *
 * Override with FY=2025 to audit a closed year deliberately.
 */
const fyFromArg = Number(process.env.FY)
const now = new Date()
const fyStartYear = Number.isFinite(fyFromArg) && fyFromArg > 2000
  ? fyFromArg
  : now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
const FY_START = `${fyStartYear}-04-01`, FY_END = `${fyStartYear + 1}-03-31`
console.log(`\n=== ${isProd ? "PROD" : "DEV"} — fiscal year ${FY_START} .. ${FY_END} ===`)

for (const t of await sql`SELECT id, name FROM tenants ORDER BY name`) {
  const one = async (q) => Number((await q)[0]?.v ?? 0)

  // Labour, as season-pl / accounts-totals / balance-sheet all read it.
  const labour = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labour_cost
    WHERE tenant_id=${t.id} AND work_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  // Expenses, same window.
  const expense = await one(sql`SELECT COALESCE(SUM(total_amount),0) v FROM expense_transactions
    WHERE tenant_id=${t.id} AND entry_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  // Inventory bought in (season-summary reads this as its own line).
  // `Price updated%` rows are revaluation, not trade -- correcting an item's price used to write a
  // full deplete-and-restock pair valued at the entire holding. finance-balance-sheet and
  // season-summary both exclude them; this did not, so it reported HoneyFarm buying Rs 8,94,933 of
  // stock when 94% of that was a price edit, and disagreed with the two screens it exists to
  // reconcile. A crosscheck that uses different rules from the thing it checks is not a crosscheck.
  const restock = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM transaction_history
    WHERE tenant_id=${t.id} AND LOWER(transaction_type) IN ('restock','restocking')
      AND COALESCE(notes,'') NOT ILIKE 'Price updated%'
      AND transaction_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  // Inventory consumed. Expense-linked depletions carry the same money as the expense row.
  const deplete = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM transaction_history
    WHERE tenant_id=${t.id} AND LOWER(transaction_type) NOT IN ('restock','restocking')
      AND COALESCE(notes,'') NOT ILIKE 'Price updated%'
      AND transaction_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  // How much of that consumption was created BY an expense entry -- the overlap that would be
  // double counted by anything adding expenses and depletions together.
  // Both note shapes. Depletions written before the [expense_id:N] tag existed still say
  // "Used in expense: <code>", and matching only the tag under-reports the overlap -- which is the
  // direction that matters, since the whole point of this line is to warn about double counting.
  const linkedDeplete = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM transaction_history
    WHERE tenant_id=${t.id}
      AND (notes LIKE '%[expense_id:%' OR notes LIKE 'Used in expense:%')
      AND COALESCE(notes,'') NOT ILIKE 'Price updated%'
      AND transaction_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  const revenue = await one(sql`SELECT COALESCE(SUM(total_revenue),0) v FROM sales_records
    WHERE tenant_id=${t.id} AND sale_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)

  if (!labour && !expense && !restock && !deplete && !revenue) continue

  console.log(`\n${t.name}`)
  console.log(`  labour_cost                    ${money(labour).padStart(16)}`)
  console.log(`  expense_transactions           ${money(expense).padStart(16)}`)
  console.log(`  -> P&L cost (labour + expense) ${money(labour + expense).padStart(16)}`)
  console.log(`  inventory restocked (bought)   ${money(restock).padStart(16)}`)
  console.log(`  inventory depleted (used)      ${money(deplete).padStart(16)}`)
  console.log(`     of which created by expense ${money(linkedDeplete).padStart(16)}  <- same money as an expense row`)
  console.log(`  sales revenue                  ${money(revenue).padStart(16)}`)
  if (linkedDeplete > 0) {
    console.log(`  ** any total adding expenses AND depletions counts ${money(linkedDeplete)} twice **`)
  }
}
console.log()
