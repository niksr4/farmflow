#!/usr/bin/env node
/**
 * Rewrite the generated section of docs/DOMAIN-BRIEF.md from the live production database.
 *
 * WHY THIS EXISTS. The brief was written by hand on 2026-10-14 with its figures marked
 * `[measured]`. Eight days later, re-measuring against production found:
 *
 *   - the crop split 6x off (271/217 Robusta/Arabica -> 43/37), because the hand figures came from
 *     DEV, where four simulation tenants dominate every aggregate
 *   - `biometric_enrollments` described as "empty in both databases and always will be" while
 *     production holds 7 rows
 *   - `expense_inventory_links` described as "HoneyFarm only" while Laxmi has 8
 *   - `kg_per_bag` described as "null for every item" while 4 of 63 are set
 *   - picking 425 rows (dev) against 34 (prod); punches 808 against 1,991
 *   - HoneyFarm called the smallest estate at 16 workers when it has the most active, 40
 *
 * Every one of those is a COUNT that somebody promoted to a SENTENCE. The ratios and the
 * mechanism descriptions in the brief held up perfectly; only the counts rotted. So the counts
 * stop being prose: this script owns them, and the hand-written sections own the parts that do
 * not change.
 *
 * ⚠ READ-ONLY. Every statement here is a SELECT. It must stay that way -- this points at the
 * database six real estates depend on.
 *
 *   node scripts/dev/refresh-domain-figures.mjs            # rewrite the section
 *   node scripts/dev/refresh-domain-figures.mjs --check    # fail if stale, for CI or a cron
 *   node scripts/dev/refresh-domain-figures.mjs --print    # print, touch nothing
 *
 * Reads DATABASE_URL from the environment, else from .env.vercel.production (prod's connection
 * string does NOT live in .env.local). The string is never printed.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const BRIEF = "docs/DOMAIN-BRIEF.md"
const BEGIN = "<!-- BEGIN GENERATED: node scripts/dev/refresh-domain-figures.mjs -->"
const END = "<!-- END GENERATED -->"

/** Tenants that are not customers. Dev has more; production has exactly this one. */
const NOT_CUSTOMERS = new Set(["Estate Mock", "Two Estate Sim", "Kodagu Test Estate", "Medappa Dev Copy"])

const resolveUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  for (const file of [".env.vercel.production", ".env.local"]) {
    if (!existsSync(file)) continue
    const match = readFileSync(file, "utf8").match(/^DATABASE_URL=["']?([^"'\n]+)/m)
    if (match) return match[1]
  }
  throw new Error(
    "No DATABASE_URL. Export it, or keep it in .env.vercel.production. Never paste it on a command line.",
  )
}

const sql = neon(resolveUrl())

/** The estate's today, not the host's. This runs on a laptop that may be anywhere. */
const istToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", dateStyle: "short" }).format(new Date())

const pct = (a, b) => (Number(b) > 0 ? `${((Number(a) / Number(b)) * 100).toFixed(1)}%` : "n/a")
const num = (value) => Number(value ?? 0).toLocaleString("en-IN")

async function collect() {
  const tenants = await sql`SELECT id, name FROM tenants ORDER BY name`
  const customers = tenants.filter((t) => !NOT_CUSTOMERS.has(t.name))

  const users = await sql`
    SELECT t.name, u.role, count(*)::int n
    FROM users u JOIN tenants t ON t.id = u.tenant_id
    GROUP BY 1, 2 ORDER BY 1, 2`

  const workers = await sql`
    SELECT t.name,
           count(*) FILTER (WHERE a.active)::int active,
           count(*) FILTER (WHERE a.active AND COALESCE(a.daily_rate,0)=0 AND COALESCE(a.monthly_wage,0)=0)::int norate
    FROM attendance_workers a JOIN tenants t ON t.id = a.tenant_id
    GROUP BY 1 ORDER BY 1`

  const blocks = await sql`
    SELECT t.name, count(*)::int total, count(l.area_acres)::int with_acres,
           COALESCE(SUM(l.area_acres), 0)::numeric acres
    FROM locations l JOIN tenants t ON t.id = l.tenant_id
    GROUP BY 1 ORDER BY 1`

  const crop = await sql`
    SELECT coffee_type, count(*)::int n FROM processing_records GROUP BY 1 ORDER BY 2 DESC`

  const processingByTenant = await sql`
    SELECT t.name, count(*)::int n, min(p.process_date)::text lo, max(p.process_date)::text hi
    FROM processing_records p JOIN tenants t ON t.id = p.tenant_id
    GROUP BY 1 ORDER BY 2 DESC`

  // Outturn for whichever tenant actually has the processing history, rather than a hardcoded name.
  const deepest = processingByTenant.filter((r) => !NOT_CUSTOMERS.has(r.name))[0]
  const outturn = deepest
    ? (
        await sql`
          SELECT SUM(p.crop_today)::numeric crop, SUM(p.wet_parchment)::numeric wp,
                 SUM(p.dry_parch)::numeric dp, SUM(p.dry_cherry)::numeric dc,
                 round(avg(NULLIF(p.fr_wp_percent,0)),1) fr_wp,
                 round(avg(NULLIF(p.wp_dp_percent,0)),1) wp_dp,
                 round(avg(NULLIF(p.ripe_percent,0)),1) ripe,
                 round(avg(NULLIF(p.float_percent,0)),1) flt
          FROM processing_records p JOIN tenants t ON t.id = p.tenant_id
          WHERE t.name = ${deepest.name}`
      )[0]
    : null

  const counts = {}
  const countOf = async (label, run) => {
    try {
      counts[label] = Number(Object.values((await run())[0])[0])
    } catch (error) {
      counts[label] = `unavailable (${error.message.slice(0, 60)})`
    }
  }
  await countOf("picking_records", () => sql`SELECT count(*)::int FROM picking_records`)
  await countOf("biometric_punches", () => sql`SELECT count(*)::int FROM biometric_punches`)
  await countOf("biometric_enrollments", () => sql`SELECT count(*)::int FROM biometric_enrollments`)
  await countOf("rainfall_records", () => sql`SELECT count(*)::int FROM rainfall_records`)
  await countOf("audit_logs", () => sql`SELECT count(*)::int FROM audit_logs`)

  const movements = await sql`
    SELECT transaction_type t, count(*)::int n FROM transaction_history GROUP BY 1 ORDER BY 2 DESC`
  const zeroDepletions = Number(
    (
      await sql`SELECT count(*)::int n FROM transaction_history
                WHERE transaction_type='deplete' AND COALESCE(total_cost,0)=0`
    )[0].n,
  )
  const stockItems = (
    await sql`SELECT count(*)::int total, count(*) FILTER (WHERE kg_per_bag IS NULL)::int nul
              FROM current_inventory`
  )[0]
  const stockLinks = await sql`
    SELECT t.name, count(*)::int n FROM expense_inventory_links e JOIN tenants t ON t.id = e.tenant_id
    GROUP BY 1 ORDER BY 2 DESC`
  /**
   * Block attribution — the stated moat, and the thing most likely to be missing.
   *
   * Counted over the muster arm only (`labour_assignments`), because the legacy arm predates block
   * attribution entirely and would make every tenant look worse than they are.
   */
  const attribution = await sql`
    SELECT t.name,
           count(*)::int total,
           count(*) FILTER (WHERE a.location_id IS NULL)::int unattributed
    FROM labour_assignments a JOIN tenants t ON t.id = a.tenant_id
    GROUP BY 1 ORDER BY 1`

  /**
   * The LEGACY arm too, because reporting only one of them is how the brief came to say
   * "cost per block works for about one estate" long after it had stopped being true. The two arms
   * answer different questions and a reader needs both: legacy is the history, muster is the
   * living write path.
   */
  const attributionLegacy = await sql`
    SELECT t.name,
           count(*)::int total,
           count(*) FILTER (WHERE l.location_id IS NULL)::int unattributed
    FROM labor_transactions l JOIN tenants t ON t.id = l.tenant_id
    GROUP BY 1 ORDER BY 1`

  /** How concentrated spend is: a top-heavy estate is booking to "general", not to blocks. */
  const concentration = await sql`
    WITH per AS (
      SELECT t.name tenant, a.location_id, SUM(a.total_cost)::numeric c
      FROM labour_assignments a JOIN tenants t ON t.id = a.tenant_id
      GROUP BY 1, 2)
    SELECT tenant, count(*)::int locations,
           round(100 * MAX(c) / NULLIF(SUM(c), 0), 1) top_share
    FROM per GROUP BY 1 ORDER BY 1`

  const moisture = (
    await sql`SELECT count(moisture_pct)::int n, count(*)::int total FROM processing_records`
  )[0]

  // The cutover is a DATE per tenant, and a tenant with no row cannot allocate labour at all.
  let cutovers = []
  try {
    cutovers = await sql`
      SELECT t.name, m.assignments_from::text FROM tenants t
      LEFT JOIN tenant_labour_entry_mode m ON m.tenant_id = t.id ORDER BY t.name`
  } catch {
    cutovers = null
  }

  return {
    tenants, customers, users, workers, blocks, crop, processingByTenant, attribution, attributionLegacy, concentration,
    deepest, outturn, counts, movements, zeroDepletions, stockItems, stockLinks, moisture, cutovers,
  }
}

function render(d) {
  const L = []
  const byName = (rows, name) => rows.find((r) => r.name === name)
  const userLabel = (name) =>
    d.users.filter((u) => u.name === name).map((u) => `${u.n} ${u.role}`).join(", ") || "none"

  L.push(BEGIN)
  L.push("")
  L.push(`**Generated ${istToday()} (IST) from PRODUCTION by \`node scripts/dev/refresh-domain-figures.mjs\`.**`)
  L.push("Do not hand-edit anything between these markers; re-run the script instead. Everything here")
  L.push("is a count or a ratio, and counts are the only part of this brief that has ever rotted.")
  L.push("")

  L.push(`### Tenants — ${d.customers.length} customers, ${d.tenants.length} rows`)
  L.push("")
  L.push("| Estate | Blocks | Acreage entered | Active workers | No rate | Users |")
  L.push("|---|---|---|---|---|---|")
  for (const t of d.customers) {
    const b = byName(d.blocks, t.name)
    const w = byName(d.workers, t.name)
    L.push(
      `| ${t.name} | ${b?.total ?? 0} | ${b?.with_acres ?? 0} of ${b?.total ?? 0}` +
        `${Number(b?.acres) > 0 ? ` (${Number(b.acres).toFixed(1)} ac)` : ""} | ${w?.active ?? 0} | ` +
        `${w?.norate ?? 0} | ${userLabel(t.name)} |`,
    )
  }
  const excluded = d.tenants.filter((t) => NOT_CUSTOMERS.has(t.name)).map((t) => t.name)
  if (excluded.length) {
    L.push("")
    L.push(`Excluded as not a customer: ${excluded.join(", ")}.`)
  }
  L.push("")
  L.push("`No rate` counts ACTIVE workers with neither a daily rate nor a monthly wage. Each one costs")
  L.push("Rs 0 in payroll and in every cost report, silently.")
  L.push("")

  if (d.cutovers) {
    const missing = d.cutovers.filter((c) => !c.assignments_from).map((c) => c.name)
    L.push(
      `**Muster cutover dates:** ` +
        d.cutovers
          .filter((c) => c.assignments_from)
          .map((c) => `${c.name} ${c.assignments_from}`)
          .join(", ") +
        ".",
    )
    if (missing.length) {
      L.push("")
      L.push(
        `⚠ **No cutover row at all: ${missing.join(", ")}.** A tenant with no row cannot allocate ` +
          `labour on the muster -- every allocation is refused -- so this is a live block on that estate, ` +
          `not a tidy-up.`,
      )
    }
    L.push("")
  }

  L.push("### Crop and processing")
  L.push("")
  L.push(`**Processing records by tenant:** ${d.processingByTenant.map((r) => `${r.name} ${r.n}`).join(", ")}.`)
  L.push("")
  L.push(`**Coffee type across all records:** ${d.crop.map((r) => `${r.coffee_type} ${r.n}`).join(", ")}.`)
  L.push("")
  L.push("⚠ Read that split as ONE estate's habit, not the market's. Almost every processing row on")
  L.push("production belongs to a single tenant, so this is their varietal mix and nothing more. The")
  L.push("hand-written brief previously quoted a 271/217 split from DEV, where simulation tenants")
  L.push("dominate, and called the customer base Robusta-leaning on that basis.")
  L.push("")

  if (d.outturn && d.deepest) {
    const o = d.outturn
    L.push(`**Outturn — ${d.deepest.name}, ${d.deepest.n} records, ${d.deepest.lo} to ${d.deepest.hi}, ${num(o.crop)} kg of cherry.**`)
    L.push("")
    L.push("| Conversion | Aggregate (volume-weighted) | Stored per-record average |")
    L.push("|---|---|---|")
    L.push(`| Fresh fruit to wet parchment | **${pct(o.wp, o.crop)}** | \`fr_wp_percent\` **${o.fr_wp}%** |`)
    L.push(`| Wet parchment to dry parchment | **${pct(o.dp, o.wp)}** | \`wp_dp_percent\` **${o.wp_dp}%** |`)
    L.push(`| Cherry to dry parchment | **${pct(o.dp, o.crop)}** | — |`)
    L.push(`| Cherry to dry cherry | **${pct(o.dc, o.crop)}** | — |`)
    L.push(`| Ripe share of intake | — | **${o.ripe}%** |`)
    L.push(`| Float share | — | **${o.flt}%** |`)
    L.push("")
    L.push("The two fresh-to-wet figures differ because they use different denominators, and both are")
    L.push("right. See the hand-written section on which to quote.")
    L.push("")
  }

  L.push(`**Moisture:** ${d.moisture.n} of ${d.moisture.total} processing rows carry \`moisture_pct\`.`)
  L.push("")

  L.push("### Row counts worth knowing")
  L.push("")
  L.push("| What | Rows |")
  L.push("|---|---|")
  for (const [label, value] of Object.entries(d.counts)) L.push(`| \`${label}\` | ${num(value)} |`)
  L.push(`| \`transaction_history\` by type | ${d.movements.map((m) => `${m.t} ${num(m.n)}`).join(", ")} |`)
  L.push("")
  L.push(`**Stock:** ${d.stockItems.nul} of ${d.stockItems.total} items have no \`kg_per_bag\`. ` +
    `${num(d.zeroDepletions)} depletions are valued at Rs 0 because the item was never priced.`)
  L.push("")
  L.push("### Block attribution — the moat, measured on both arms")
  L.push("")
  L.push("| Estate | Muster rows | Muster unattributed | Legacy rows | Legacy unattributed | Blocks used | Top block's share |")
  L.push("|---|---|---|---|---|---|---|")
  for (const a of d.attribution.filter((r) => !NOT_CUSTOMERS.has(r.name))) {
    const leg = d.attributionLegacy.find((r) => r.name === a.name)
    const con = d.concentration.find((r) => r.tenant === a.name)
    L.push(
      `| ${a.name} | ${num(a.total)} | ${num(a.unattributed)} (${pct(a.unattributed, a.total)}) | ` +
        `${num(leg?.total ?? 0)} | ${leg ? `${num(leg.unattributed)} (${pct(leg.unattributed, leg.total)})` : "—"} | ` +
        `${con?.locations ?? 0} | ${con?.top_share ?? "—"}% |`,
    )
  }
  L.push("")
  L.push("⚠ **Read the two arms separately, and do not quote the legacy one as the current state.**")
  L.push("The legacy arm is history recorded before each tenant's cutover, when block attribution was")
  L.push("largely absent. The muster arm is the live write path and is attributed almost completely.")
  L.push("An earlier hand-written version of this brief quoted the legacy figures without saying so and")
  L.push("concluded that cost per block worked for about one estate; on the muster arm it works for all")
  L.push("of them.")
  L.push("")
  L.push("**So attribution is no longer the blocker — ACREAGE is.** Cost per block needs a block on the")
  L.push("row, which it now has; cost per ACRE additionally needs `area_acres` on the block, and the")
  L.push("acreage column in the tenant table above shows how few have it. Those are two different")
  L.push("problems and conflating them misreads the product's position.")
  L.push("")
  L.push(`**Expense-to-stock links:** ${d.stockLinks.length ? d.stockLinks.map((s) => `${s.name} ${s.n}`).join(", ") : "none"}.`)
  L.push("")
  L.push(END)
  return L.join("\n")
}

const main = async () => {
  const mode = process.argv.includes("--check") ? "check" : process.argv.includes("--print") ? "print" : "write"
  const section = render(await collect())

  if (mode === "print") {
    console.log(section)
    return
  }

  const current = readFileSync(BRIEF, "utf8")
  const start = current.indexOf(BEGIN)
  const finish = current.indexOf(END)
  if (start === -1 || finish === -1) {
    throw new Error(
      `${BRIEF} has no generated section. Add the BEGIN/END markers where the figures should live.`,
    )
  }

  const next = current.slice(0, start) + section + current.slice(finish + END.length)

  if (mode === "check") {
    // Compare everything except the generation date, so an unchanged database is not "stale".
    const strip = (text) => text.replace(/\*\*Generated \d{4}-\d{2}-\d{2}[^\n]*\n/, "")
    if (strip(next) !== strip(current)) {
      console.error("DOMAIN-BRIEF.md figures are out of date. Run: node scripts/dev/refresh-domain-figures.mjs")
      process.exitCode = 1
      return
    }
    console.log("DOMAIN-BRIEF.md figures match production.")
    return
  }

  writeFileSync(BRIEF, next)
  console.log(`Refreshed the generated section of ${BRIEF}.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
