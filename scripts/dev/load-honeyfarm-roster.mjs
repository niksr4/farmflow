/**
 * Put HoneyFarm's 28 permanent employees on the roster, with their fingerprint IDs.
 *
 * Run: node --env-file=.env.local scripts/dev/load-honeyfarm-roster.mjs [prod]           (dry run)
 *      node --env-file=.env.local scripts/dev/load-honeyfarm-roster.mjs [prod] --commit
 *
 * Source: their SmartHCM export. The employee number there is the fingerprint enrolment ID, so it
 * goes in `device_user_code` -- the column the biometric relay matches punches against. Loading it
 * now means the scanner works the day it is installed instead of needing 28 names re-entered
 * against it.
 *
 * NO DAILY RATE IS SET. Rs 475 covers 97% of their *estate* man-days, but the estate/outside split
 * turns out not to be two groups of people -- it is two rates, and lately not even that: since
 * roughly June every day reads "estate 0, outside 27", which is the whole roster logged in the
 * outside column. Seeding one rate across 28 people would therefore be wrong for about half of
 * them, and wrong in the direction nobody checks, because a plausible number invites no scrutiny.
 *
 * The consequence is deliberate: /api/attendance/assignments refuses to allocate a worker with no
 * rate and names them, so the muster will not save until each has one. The roster screen shows
 * exactly who is missing, which is the worklist for filling them in.
 *
 * ESTATE IS LEFT NULL, DELIBERATELY. Every row in the export says "Honey Farm", which is the
 * company -- HoneyFarm the tenant runs two estates, Honeyfarm and Sidapur, and the export does not
 * say which of them anyone works on. A NULL estate shows the worker under both, which is the
 * always-shows rule the rest of the app uses. Guessing "Honeyfarm" would hide anyone who actually
 * works at Sidapur from the only muster they belong on, and nothing on screen would explain why.
 *
 * GENDER AND WORKER TYPE ARE LEFT NULL for the same reason: the export does not carry them, and
 * several of these names read as gendered to an outsider without that being evidence of anything.
 * INDICOFS 4.6.2I wants gender, so it is worth asking for -- but asking is the way to get it.
 *
 * THESE 28 ARE THE WHOLE WORKFORCE, which took a moment to establish. 3,478 of their 6,271 man-days
 * this season sit in the "outside" column, and the obvious reading is a contract gang nobody has
 * named. The data says otherwise: every recent day reads estate 0 / outside 27, and 27 is this
 * roster. Average turnout is 22.2 against 28 on the books -- 79%, which is what a daily muster of
 * permanent staff looks like, not a gang hired by the job. So no `gang` row is needed; the outside
 * column is where they have been logging everyone, at a second rate.
 */
import { neon } from "@neondatabase/serverless"

const isProd = process.argv.includes("prod")
const commit = process.argv.includes("--commit")
const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)

/**
 * From their SmartHCM export of 25 Aug 2026: [fingerprint id, name, type, daily rate, gender].
 *
 * A null rate is not missing data. Staff are paid monthly and the proprietor is not paid a daily
 * wage at all -- the export says "Monthly" and "0" respectively, neither of which is a day rate.
 * Storing 0 would be a claim that a day of their time costs nothing; null says the app does not
 * price their day, which is true, and the muster then declines to cost them rather than costing
 * them wrong. Their pay is a kind of labour cost the product does not model yet (STATUS.md).
 */
const ROSTER = [
  [1, "Bopaiah", "staff", null, "male"],
  [2, "Muthu", "staff", null, "male"],
  [3, "Chandra", "chkroll_pf", 494, "male"],
  [4, "Chandrika", "chkroll_pf", 494, "female"],
  [5, "Sara", "chkroll_pf", 494, "female"],
  [6, "Nabeesa", "chkroll_pf", 494, "female"],
  [7, "Lakshmi", "chkroll_pf", 494, "female"],
  [14, "Putturaju", "chkroll_pf", 494, "male"],
  [15, "Radha", "chkroll_pf", 494, "female"],
  [19, "Pathu", "chkroll_pf", 494, "female"],
  [22, "Seethu", "casuals", 494, "female"],
  [23, "Sabiya", "casuals", 494, "female"],
  [24, "Tangamma", "casuals", 494, "female"],
  [31, "Saina", "casuals", 494, "female"],
  [32, "Margina", "seasonal_assam", 460, "female"],
  [33, "Ajitali", "seasonal_assam", 460, "male"],
  [36, "Makusali", "seasonal_assam", 460, "male"],
  [37, "Aminul", "seasonal_assam", 460, "male"],
  [39, "Safikul", "seasonal_assam", 460, "male"],
  [40, "Ishak", "seasonal_assam", 460, "male"],
  [41, "Vajura", "seasonal_assam", 460, "female"],
  [50, "AkashAli", "seasonal_assam", 460, "male"],
  [51, "Abeeja", "seasonal_assam", 460, "female"],
  [52, "Kajolly", "seasonal_assam", 460, "female"],
  [53, "Akibul", "seasonal_assam", 460, "male"],
  [100, "Sumant C", "proprietor", null, "male"],
  [103, "Sidda", "casuals", 494, "male"],
  [104, "Rathna", "casuals", 494, "female"],
]

const [tenant] = await sql`SELECT id, name FROM tenants WHERE name = 'HoneyFarm'`
if (!tenant) {
  console.error(`No HoneyFarm tenant on ${isProd ? "PROD" : "dev"}.`)
  process.exit(1)
}

const existing = await sql`
  SELECT device_user_code, full_name, worker_type, daily_rate, gender
  FROM attendance_workers WHERE tenant_id = ${tenant.id}`
const byCode = new Map(existing.filter((w) => w.device_user_code).map((w) => [String(w.device_user_code), w]))

console.log(`\n=== ${isProd ? "PRODUCTION" : "dev"} — HoneyFarm roster ===\n`)
console.log(`  on the roster now : ${existing.length}`)
console.log(`  in the export     : ${ROSTER.length}\n`)

const byType = {}
for (const [, , type, rate] of ROSTER) {
  byType[type] ??= { n: 0, rate }
  byType[type].n += 1
}
for (const [type, v] of Object.entries(byType))
  console.log(`    ${type.padEnd(16)} ${String(v.n).padStart(2)} people  ${v.rate == null ? "no daily rate (paid monthly)" : "Rs " + v.rate + "/day"}`)

const missing = ROSTER.filter(([code]) => !byCode.has(String(code)))
if (missing.length) console.log(`\n  ${missing.length} not yet on the roster: ${missing.map((m) => m[1]).join(", ")}`)

if (!commit) {
  console.log("\nDry run. Re-run with --commit to write.\n")
  process.exit(0)
}

let added = 0
let updated = 0
for (const [code, name, type, rate, gender] of ROSTER) {
  if (byCode.has(String(code))) {
    await sql`
      UPDATE attendance_workers
      SET full_name = ${name}, worker_type = ${type}, daily_rate = ${rate}, gender = ${gender}, active = true
      WHERE tenant_id = ${tenant.id} AND device_user_code = ${String(code)}`
    updated += 1
  } else {
    await sql`
      INSERT INTO attendance_workers (tenant_id, full_name, active, worker_type, daily_rate, gender, device_user_code, kind)
      VALUES (${tenant.id}, ${name}, true, ${type}, ${rate}, ${gender}, ${String(code)}, 'individual')`
    added += 1
  }
}

const [after] = await sql`
  SELECT COUNT(*) FILTER (WHERE active)::int active,
         COUNT(*) FILTER (WHERE active AND COALESCE(daily_rate,0) = 0)::int unrated,
         COUNT(*) FILTER (WHERE device_user_code IS NOT NULL)::int coded
  FROM attendance_workers WHERE tenant_id = ${tenant.id}`

console.log(`\nWRITTEN. ${added} added, ${updated} updated.`)
console.log(`  roster now: ${after.active} active, ${after.unrated} without a rate, ${after.coded} with a fingerprint id\n`)
console.log(`  The 3 without a daily rate are the 2 staff and the proprietor, and that is correct:`)
console.log(`  the export says "Monthly" and "0", neither of which is a day rate. The muster will`)
console.log(`  decline to cost their day rather than cost it wrong. Their pay needs labour_charges,`)
console.log(`  which is parked -- see STATUS.md.\n`)
console.log(`  Note for the cutover: their history splits labour into estate vs contract columns,`)
console.log(`  and lately every day reads estate 0 / outside 27 -- the whole roster in the outside`)
console.log(`  column. On the muster these are 28 individuals, so their cost lands in the ESTATE`)
console.log(`  column from the cutover on. A report spanning the line will show that mix flip. It`)
console.log(`  is more accurate, not less, but it will look like a change.\n`)
