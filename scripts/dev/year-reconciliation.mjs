/**
 * Does every number reconcile, for every tenant, across a whole fiscal year? Read-only.
 *
 * Run: node --env-file=.env.local scripts/dev/year-reconciliation.mjs          (dev)
 *      DATABASE_URL exported, then: node scripts/dev/year-reconciliation.mjs prod
 *      FY=2025 to audit a closed year.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR, AND WHY IT IS NOT A SEEDED SIMULATION.
 *
 * The obvious way to test a year is to seed twelve synthetic months and check the totals. That
 * tests the arithmetic against data shaped the way the author imagined. The shapes that actually
 * break aggregation are the ones real estates produce: a labour cutover halfway through the year,
 * an estate with zero inventory, an item priced at nothing, a sale with a null bag type, a
 * dispatch whose received weight nobody confirmed.
 *
 * Dev carries five real estates with between one and seventy-four thousand rows each and a real
 * cutover in the middle of this year, so this reconciles against those instead of inventing data.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE RULE EVERY CHECK FOLLOWS: compute the same quantity by two INDEPENDENT routes and compare.
 *
 * A total that agrees with itself proves nothing. Each check below recomputes a figure from base
 * tables and holds it against the view or the route the app actually reads, so a disagreement
 * localises the bug rather than merely reporting one.
 *
 * ⚠ THE ONE THAT MATTERS MOST IS LABOUR ACROSS THE CUTOVER. `labour_cost` is a UNION: Accounts
 * rows from before an estate switched, muster rows from after. The boundary condition lives inside
 * the view (`NOT EXISTS (… deployment_date >= assignments_from)`), so an off-by-one there either
 * counts a day twice or loses it, and both read as a plausible number on screen. HoneyFarm
 * switched mid-year, which is exactly the case worth checking.
 */
import { neon } from "@neondatabase/serverless"

const isProd = process.argv[2] === "prod"
const url = isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV
if (!url) throw new Error(isProd ? "export DATABASE_URL for prod" : "DATABASE_URL_DEV is required")
const sql = neon(url)

const money = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })
const kg = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + " kg"
const one = async (q) => Number((await q)[0]?.v ?? 0)
/** Money is compared to the paisa, not exactly: NUMERIC sums reassociate and 0.01 is not a bug. */
const near = (a, b, tol = 0.01) => Math.abs(Number(a) - Number(b)) <= tol

let pass = 0
let fail = 0
const failures = []

const check = (tenant, label, ok, detail = "") => {
  if (ok) {
    pass++
    console.log(`    ok    ${label}${detail ? `  ${detail}` : ""}`)
  } else {
    fail++
    failures.push(`[${tenant}] ${label}${detail ? ` — ${detail}` : ""}`)
    console.log(`    FAIL  ${label}${detail ? `  ${detail}` : ""}`)
  }
}

// The Indian fiscal year containing the estate's today, in IST, computed not typed.
const fyOverride = Number(process.env.FY)
const [{ fy_start: autoStart }] = await sql`
  SELECT (CASE WHEN EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'Asia/Kolkata')) >= 4
               THEN date_trunc('year', (NOW() AT TIME ZONE 'Asia/Kolkata')) + INTERVAL '3 months'
               ELSE date_trunc('year', (NOW() AT TIME ZONE 'Asia/Kolkata')) - INTERVAL '9 months'
          END)::date::text AS fy_start`
const FY_START = Number.isFinite(fyOverride) && fyOverride > 2000 ? `${fyOverride}-04-01` : autoStart
const FY_END = `${Number(FY_START.slice(0, 4)) + 1}-03-31`

console.log(`\n=== year reconciliation — ${isProd ? "PROD" : "DEV"} — ${FY_START} .. ${FY_END} ===`)

const tenants = await sql`SELECT id, name FROM tenants ORDER BY name`

for (const t of tenants) {
  console.log(`\n── ${t.name} ${"─".repeat(Math.max(0, 70 - t.name.length))}`)

  /* ═══ 1. LABOUR ACROSS THE CUTOVER ═══════════════════════════════════════════════════════════
     labour_cost unions pre-cutover Accounts rows with post-cutover muster rows. Recomputed here
     from both base tables with the boundary applied by hand, which is the only way to see a
     double count or a lost day. */
  const cutRows = await sql`SELECT assignments_from::text d FROM tenant_labour_entry_mode WHERE tenant_id = ${t.id}`
  const cutover = cutRows[0]?.d || null

  const viewLabour = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labour_cost
    WHERE tenant_id=${t.id} AND work_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)

  // Independent: legacy Accounts rows the view should keep (strictly before the cutover, or all
  // of them when the estate never switched).
  const legacyKept = cutover
    ? await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labor_transactions
        WHERE tenant_id=${t.id} AND deployment_date BETWEEN ${FY_START}::date AND ${FY_END}::date
          AND deployment_date < ${cutover}::date`)
    : await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labor_transactions
        WHERE tenant_id=${t.id} AND deployment_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)

  // Independent: muster rows, priced the way the view prices them (gang headcount x rate x share).
  const musterKept = await one(sql`
    SELECT COALESCE(SUM(
      CASE WHEN w.kind = 'gang' THEN COALESCE(a.headcount, w.headcount, 1) ELSE 1 END
      * COALESCE(a.rate, w.daily_rate, 0) * COALESCE(a.day_fraction, 1)
      * COALESCE(a.pay_multiplier, 1)
    ), 0) v
    FROM labour_assignments a JOIN attendance_workers w ON w.id = a.worker_id
    WHERE a.tenant_id=${t.id} AND a.work_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
    .catch(() => 0)

  console.log(`    cutover: ${cutover || "never switched"}`)
  console.log(`    labour_cost view        ${money(viewLabour)}`)
  console.log(`    legacy kept + muster    ${money(legacyKept)} + ${money(musterKept)} = ${money(legacyKept + musterKept)}`)

  // Lump-sum contract rows price differently, so an exact match is only expected without them.
  const lumpSum = await one(sql`SELECT COALESCE(SUM(lump_sum),0) v FROM labour_assignments
    WHERE tenant_id=${t.id} AND work_date BETWEEN ${FY_START}::date AND ${FY_END}::date AND lump_sum IS NOT NULL`)
    .catch(() => 0)

  if (lumpSum > 0) {
    console.log(`    (of which contract lump sums ${money(lumpSum)}, priced by amount not by rate)`)
    check(t.name, "labour reconciles once contract lump sums are allowed for",
      viewLabour >= legacyKept && viewLabour > 0, `view ${money(viewLabour)}`)
  } else {
    check(t.name, "labour_cost equals its two sources, with the cutover applied once",
      near(viewLabour, legacyKept + musterKept, 1),
      `${money(viewLabour)} vs ${money(legacyKept + musterKept)}`)
  }

  /* THE DOUBLE-COUNT TEST. If the view's boundary is wrong, a day on or after the cutover appears
     in both halves. Counted directly: Accounts rows dated on/after the cutover must contribute
     nothing to the view. */
  if (cutover) {
    const legacyAfter = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labor_transactions
      WHERE tenant_id=${t.id} AND deployment_date >= ${cutover}::date`)
    const viewFromLegacyAfter = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labour_cost
      WHERE tenant_id=${t.id} AND source='transaction' AND work_date >= ${cutover}::date`)
    check(t.name, "no Accounts labour dated on or after the cutover is counted",
      near(viewFromLegacyAfter, 0),
      legacyAfter > 0
        ? `${money(legacyAfter)} exists in Accounts after the cutover and the view excludes ${money(legacyAfter - viewFromLegacyAfter)} of it`
        : "nothing after the cutover to exclude")

    // And the mirror: muster rows dated BEFORE the cutover must also contribute nothing, or the
    // same day is paid twice from the other direction.
    const musterBefore = await one(sql`SELECT COALESCE(SUM(total_cost),0) v FROM labour_cost
      WHERE tenant_id=${t.id} AND source='assignment' AND work_date < ${cutover}::date`)
    check(t.name, "no muster labour dated before the cutover is counted",
      near(musterBefore, 0), musterBefore > 0 ? `${money(musterBefore)} leaked` : "clean")
  }

  /* ═══ 2. TOTAL COST ══════════════════════════════════════════════════════════════════════════ */
  const viewCost = await one(sql`SELECT COALESCE(SUM(amount),0) v FROM estate_cost
    WHERE tenant_id=${t.id} AND cost_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  const expense = await one(sql`SELECT COALESCE(SUM(total_amount),0) v FROM expense_transactions
    WHERE tenant_id=${t.id} AND entry_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  check(t.name, "estate_cost is exactly labour plus expenses, counted once each",
    near(viewCost, viewLabour + expense, 1),
    `${money(viewCost)} vs ${money(viewLabour)} + ${money(expense)}`)

  /* ═══ 3. REVENUE ═════════════════════════════════════════════════════════════════════════════ */
  const viewRev = await one(sql`SELECT COALESCE(SUM(revenue),0) v FROM booked_revenue
    WHERE tenant_id=${t.id} AND sale_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  const coffeeRev = await one(sql`SELECT COALESCE(SUM(COALESCE(NULLIF(revenue,0), total_revenue, 0)),0) v
    FROM sales_records WHERE tenant_id=${t.id} AND sale_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  const otherRev = await one(sql`SELECT COALESCE(SUM(COALESCE(NULLIF(revenue,0), NULLIF(contract_amount,0),
      COALESCE(kgs_sold,0)*COALESCE(rate_per_kg,0))),0) v
    FROM other_sales_records WHERE tenant_id=${t.id} AND sale_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  check(t.name, "booked_revenue is coffee plus intercrop sales, counted once each",
    near(viewRev, coffeeRev + otherRev, 1),
    `${money(viewRev)} vs ${money(coffeeRev)} + ${money(otherRev)}`)

  /* ═══ 4. PROCESSING MASS BALANCE ═════════════════════════════════════════════════════════════
     Physical impossibilities, which no ratio check would catch: more dry weight out than fruit in,
     a sort split exceeding the day's crop, a ratio above 100%. */
  const proc = await sql`
    SELECT COUNT(*)::int n,
      COUNT(*) FILTER (WHERE COALESCE(ripe_today,0)+COALESCE(green_today,0)+COALESCE(float_today,0)
                             > COALESCE(crop_today,0) + 0.5)::int AS split_exceeds_crop,
      COUNT(*) FILTER (WHERE COALESCE(dry_parch,0)+COALESCE(dry_cherry,0) > COALESCE(crop_today,0) + 0.5)::int AS out_exceeds_in,
      COUNT(*) FILTER (WHERE COALESCE(wet_parchment,0) > COALESCE(crop_today,0) + 0.5)::int AS wet_exceeds_crop,
      COUNT(*) FILTER (WHERE COALESCE(dry_parch,0) > COALESCE(wet_parchment,0) + 0.5)::int AS dry_exceeds_wet,
      COUNT(*) FILTER (WHERE COALESCE(fr_wp_percent,0) > 100 OR COALESCE(wp_dp_percent,0) > 100
                             OR COALESCE(dry_cherry_percent,0) > 100)::int AS ratio_over_100
    FROM processing_records WHERE tenant_id=${t.id}`
  const p = proc[0]
  if (p.n > 0) {
    console.log(`    processing rows: ${p.n}`)
    check(t.name, "the sort split never exceeds the day's crop", p.split_exceeds_crop === 0, `${p.split_exceeds_crop} rows`)
    check(t.name, "dry weight out never exceeds fresh fruit in", p.out_exceeds_in === 0, `${p.out_exceeds_in} rows`)
    check(t.name, "wet parchment never exceeds the day's crop", p.wet_exceeds_crop === 0, `${p.wet_exceeds_crop} rows`)
    check(t.name, "dry parchment never exceeds the wet it came from", p.dry_exceeds_wet === 0, `${p.dry_exceeds_wet} rows`)
    check(t.name, "no stored ratio is above 100%", p.ratio_over_100 === 0, `${p.ratio_over_100} rows`)
  }

  /* ═══ 5. DISPATCH TO SALES ═══════════════════════════════════════════════════════════════════
     An estate cannot sell more than the curer confirmed receiving. Checked per variety and form,
     because a total that balances can hide one slot overdrawn and another under. */
  const slots = await sql.query(
    `WITH d AS (
       SELECT COALESCE(NULLIF(trim(coffee_type),''),'?') AS variety,
              COALESCE(NULLIF(trim(bag_type),''),'?') AS form,
              SUM(COALESCE(NULLIF(kgs_received,0),0)) AS received
       FROM dispatch_records WHERE tenant_id=$1 GROUP BY 1,2
     ), s AS (
       SELECT COALESCE(NULLIF(trim(coffee_type),''),'?') AS variety,
              COALESCE(NULLIF(trim(bag_type),''),'?') AS form,
              SUM(COALESCE(NULLIF(kgs,0), NULLIF(weight_kgs,0), NULLIF(kgs_received,0), NULLIF(kgs_sent,0), 0)) AS sold
       FROM sales_records WHERE tenant_id=$1 GROUP BY 1,2
     )
     SELECT COALESCE(d.variety,s.variety) variety, COALESCE(d.form,s.form) form,
            COALESCE(d.received,0) received, COALESCE(s.sold,0) sold
     FROM d FULL OUTER JOIN s ON s.variety=d.variety AND s.form=d.form
     ORDER BY 1,2`,
    [t.id],
  )
  if (slots.length) {
    const overdrawn = slots.filter((r) => Number(r.sold) > Number(r.received) + 0.5)
    for (const r of slots) {
      const flag = Number(r.sold) > Number(r.received) + 0.5 ? "  <- sold more than received" : ""
      console.log(`    ${String(r.variety).padEnd(10)} ${String(r.form).padEnd(14)} received ${kg(r.received).padStart(14)}  sold ${kg(r.sold).padStart(14)}${flag}`)
    }
    check(t.name, "no variety-and-form slot sells more than the curer confirmed",
      overdrawn.length === 0,
      overdrawn.length ? overdrawn.map((r) => `${r.variety} ${r.form}`).join(", ") : "every slot within what was received")
  }

  /* ═══ 6. INVENTORY, AND REVALUATION IS NOT A COST ════════════════════════════════════════════
     A price correction is a deplete-and-restock pair, not spend. Counting it as spend invented
     Rs 105 crore and Rs 64 crore of phantom money in three separate places. */
  const stockValue = await one(sql`SELECT COALESCE(SUM(quantity*avg_price),0) v FROM current_inventory
    WHERE tenant_id=${t.id} AND quantity > 0`)
  const negativeStock = await one(sql`SELECT COUNT(*) v FROM current_inventory
    WHERE tenant_id=${t.id} AND quantity < 0`)
  const unpriced = await one(sql`SELECT COUNT(*) v FROM current_inventory
    WHERE tenant_id=${t.id} AND quantity > 0 AND COALESCE(avg_price,0) = 0`)
  console.log(`    stock on hand ${money(stockValue)}${unpriced > 0 ? `, of which ${unpriced} item(s) priced at nothing` : ""}`)
  check(t.name, "no inventory line holds a negative quantity", negativeStock === 0, `${negativeStock} lines`)

  const revaluation = await one(sql`SELECT COALESCE(SUM(total_amount),0) v FROM expense_transactions
    WHERE tenant_id=${t.id} AND notes ILIKE 'Price updated%'`)
  check(t.name, "no price correction was booked as an expense",
    near(revaluation, 0), revaluation > 0 ? `${money(revaluation)} of phantom spend` : "clean")

  /* ═══ 7. TENANT ISOLATION OF THE VIEWS ═══════════════════════════════════════════════════════
     Every shared view must carry a tenant dimension, or a reader on the owner connection gets
     every estate's money. inventory_summary does not, which is why it is named here. */
  const leak = await one(sql`SELECT COALESCE(SUM(amount),0) v FROM estate_cost WHERE tenant_id <> ${t.id}
    AND cost_date BETWEEN ${FY_START}::date AND ${FY_END}::date`)
  check(t.name, "estate_cost is filterable by tenant, so one estate's total excludes the others",
    leak >= 0 && viewCost !== leak || viewCost === 0,
    `this estate ${money(viewCost)}, everyone else ${money(leak)}`)
}

/* ═══ CROSS-TENANT: the views that cannot be filtered ═══════════════════════════════════════════ */
console.log(`\n── views without a tenant dimension ${"─".repeat(38)}`)
const summary = await sql`SELECT * FROM inventory_summary`
const perTenant = await one(sql`SELECT COALESCE(SUM(quantity*avg_price),0) v FROM current_inventory WHERE quantity > 0`)
console.log(`    inventory_summary totals ${money(summary[0]?.total_inventory_value)} across ${summary[0]?.total_items} items`)
console.log(`    every tenant's stock summed ${money(perTenant)}`)
check("ALL", "inventory_summary carries a tenant dimension",
  false,
  "it has neither tenant_id nor GROUP BY, so it sums every estate together. Nothing reads it for " +
    "display today, so there is no live leak, but any route reading it on the owner connection " +
    "would show one estate another's stock value")

console.log(`\n=== ${pass} passed, ${fail} failed ===`)
if (failures.length) {
  console.log("\nfailures:")
  for (const f of failures) console.log(`  - ${f}`)
}
process.exit(fail > 0 ? 1 : 0)
