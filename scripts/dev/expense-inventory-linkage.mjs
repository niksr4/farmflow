/**
 * Does every expense that claims stock agree with the stock that actually moved? Read-only.
 *
 * Run: node --env-file=.env.local scripts/dev/expense-inventory-linkage.mjs [prod]
 *      (prod needs DATABASE_URL exported from .env.vercel.production)
 *
 * An expense that consumes stock produces two rows in two tables: the expense itself, and a
 * depletion in the ledger. Nothing in the schema ties them together -- the link is a note on the
 * depletion -- so they can disagree, and when they do neither screen says so. The expense reaches
 * the P&L; the depletion reaches the stock balance; an estate reading either one alone sees a
 * number that looks fine.
 *
 * Three ways they come apart, in increasing order of how badly:
 *
 *   1. A depletion pointing at an expense that has since been deleted. Stock left the shed for a
 *      cost nobody is carrying.
 *   2. An expense naming stock with no depletion at all. The cost is booked but the shed still
 *      thinks it has the fertiliser, so the next person to look sees stock that is not there.
 *   3. Both rows exist and disagree about the money. The P&L and the ledger then describe the same
 *      event at two different values, and the difference is invisible in both.
 *
 * TWO NOTE SHAPES, WHICH IS THE TRAP. Depletions written before the tag existed say
 * "Used in expense: <code> - <notes>"; newer ones append "[expense_id:N]". Matching only the tag
 * makes old-but-correct links look like case 2, which is how an ad-hoc version of this check
 * reported six broken links at HoneyFarm when at least one of them was a perfectly good legacy
 * row. Both shapes are matched here; only the tagged form can be attributed to a specific expense,
 * so the legacy ones are counted separately rather than being silently treated as either.
 */
import { neon } from "@neondatabase/serverless"

const isProd = process.argv[2] === "prod"
const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)
const money = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })

// Below this, a difference is the running average moving between the expense being priced and the
// depletion being written, not a mistake worth a human reading about.
const TOLERANCE = 1

console.log(`\n=== ${isProd ? "PROD" : "DEV"} — expense/inventory linkage ===`)
let problems = 0

for (const t of await sql`SELECT id, name FROM tenants ORDER BY name`) {
  const [{ n: linked }] = await sql`
    SELECT COUNT(*)::int n FROM expense_transactions
    WHERE tenant_id = ${t.id} AND inventory_item_type IS NOT NULL`
  if (!linked) continue

  console.log(`\n${t.name}  (${linked} expense(s) naming stock)`)

  // 1 — depletions whose expense is gone.
  const orphans = await sql`
    SELECT th.id, th.item_type, th.total_cost,
           (regexp_match(th.notes, '\\[expense_id:(\\d+)\\]'))[1]::bigint AS expense_id
    FROM transaction_history th
    WHERE th.tenant_id = ${t.id} AND th.notes LIKE '%[expense_id:%'`
  const dead = []
  for (const o of orphans) {
    const [hit] = await sql`SELECT 1 AS x FROM expense_transactions WHERE id = ${o.expense_id} AND tenant_id = ${t.id}`
    if (!hit) dead.push(o)
  }
  if (dead.length) {
    problems += dead.length
    console.log(`  FAIL  ${dead.length} depletion(s) point at a deleted expense, ${money(dead.reduce((s, d) => s + Number(d.total_cost), 0))} of stock with no cost carrying it`)
    for (const d of dead.slice(0, 5)) console.log(`          ledger row ${d.id}: ${d.item_type}, ${money(d.total_cost)}, expense ${d.expense_id} is gone`)
  } else {
    console.log(`  ok    no depletion points at a deleted expense`)
  }

  // 2 — expenses whose stock never moved. Legacy-note rows are matched too, by code, so an old
  //     correct link is not reported as a break.
  const unmatched = await sql`
    SELECT e.id, e.entry_date::date::text AS d, e.code, e.total_amount, e.inventory_item_type AS item
    FROM expense_transactions e
    WHERE e.tenant_id = ${t.id} AND e.inventory_item_type IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM transaction_history th
        WHERE th.tenant_id = e.tenant_id
          AND (th.notes LIKE '%[expense_id:' || e.id || ']%'
               OR (th.notes LIKE 'Used in expense: ' || e.code || '%'
                   AND th.item_type = e.inventory_item_type
                   AND th.transaction_date::date = e.entry_date::date))
      )
    ORDER BY e.entry_date`
  if (unmatched.length) {
    problems += unmatched.length
    console.log(`  FAIL  ${unmatched.length} expense(s) name stock that never left the store`)
    for (const u of unmatched.slice(0, 8)) console.log(`          ${u.d}  expense ${u.id} (code ${u.code}): ${money(u.total_amount)} of ${u.item}`)
  } else {
    console.log(`  ok    every expense naming stock has a matching depletion`)
  }

  // 3 — both rows exist and disagree. Tagged only: a legacy note cannot be attributed to one
  //     expense with enough confidence to call its value wrong.
  const drift = await sql`
    SELECT e.id, e.entry_date::date::text AS d, e.code, e.total_amount,
           (SELECT COALESCE(SUM(th.total_cost), 0) FROM transaction_history th
            WHERE th.tenant_id = e.tenant_id AND th.notes LIKE '%[expense_id:' || e.id || ']%') AS stock_value
    FROM expense_transactions e
    WHERE e.tenant_id = ${t.id} AND e.inventory_item_type IS NOT NULL
    ORDER BY e.entry_date DESC`
  const mismatched = drift.filter(
    (r) => Number(r.stock_value) > 0 && Math.abs(Number(r.total_amount) - Number(r.stock_value)) > TOLERANCE,
  )
  if (mismatched.length) {
    problems += mismatched.length
    const gap = mismatched.reduce((s, m) => s + (Number(m.total_amount) - Number(m.stock_value)), 0)
    console.log(`  WARN  ${mismatched.length} of ${drift.length} disagree about the money, net ${money(gap)} booked above what left the shed`)
    for (const m of mismatched.slice(0, 8))
      console.log(`          ${m.d}  expense ${m.id} (code ${m.code}): booked ${money(m.total_amount)} vs stock ${money(m.stock_value)}`)
  } else {
    console.log(`  ok    every linked expense is worth what its stock was worth`)
  }
}

console.log(problems === 0 ? "\nPASS — expenses and the ledger agree everywhere\n" : `\n${problems} row(s) need a look\n`)
process.exit(problems === 0 ? 0 : 1)
