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

/** [fingerprint id, name] exactly as SmartHCM has them. */
const ROSTER = [
  [1, "Bopaiah"], [2, "Muthu"], [3, "Chandra"], [4, "Chandrika"], [5, "Sara"],
  [6, "Nabeesa"], [7, "Lakshmi"], [14, "Putturaju"], [15, "Radha"], [19, "Pathu"],
  [22, "Seethu"], [23, "Sabiya"], [24, "Tangamma"], [31, "Saina"], [32, "Margina"],
  [33, "Ajitali"], [36, "Makusali"], [37, "Aminul"], [39, "Safikul"], [40, "Ishak"],
  [41, "Vajura"], [50, "AkashAli"], [51, "Abeeja"], [52, "Kajolly"], [53, "Akibul"],
  [100, "Sumant C"], [103, "Sidda"], [104, "Rathna"],
]


const [tenant] = await sql`SELECT id, name FROM tenants WHERE name = 'HoneyFarm'`
if (!tenant) {
  console.error(`No HoneyFarm tenant on ${isProd ? "PROD" : "dev"}.`)
  process.exit(1)
}

const existing = await sql`
  SELECT full_name, device_user_code FROM attendance_workers WHERE tenant_id = ${tenant.id}`
const byName = new Set(existing.map((w) => String(w.full_name).trim().toLowerCase()))
const byCode = new Set(existing.filter((w) => w.device_user_code).map((w) => String(w.device_user_code)))

const toAdd = ROSTER.filter(([code, name]) =>
  !byName.has(name.trim().toLowerCase()) && !byCode.has(String(code)))
const skipped = ROSTER.length - toAdd.length

console.log(`\n=== ${isProd ? "PRODUCTION" : "dev"} — HoneyFarm roster ===\n`)
console.log(`  already on the roster : ${existing.length}`)
console.log(`  to add                : ${toAdd.length}${skipped ? `  (${skipped} already present, matched by name or fingerprint id)` : ""}`)
console.log(`  daily rate            : NOT SET — each needs one before the muster will save`)
console.log(`  estate                : not set — shows under both Honeyfarm and Sidapur\n`)
for (const [code, name] of toAdd) console.log(`    #${String(code).padStart(3)}  ${name}`)

if (!commit) {
  console.log("\nDry run. Re-run with --commit to write.\n")
  process.exit(0)
}

let added = 0
for (const [code, name] of toAdd) {
  await sql`
    INSERT INTO attendance_workers (tenant_id, full_name, active, device_user_code, kind)
    VALUES (${tenant.id}, ${name}, true, ${String(code)}, 'individual')`
  added += 1
}

const [after] = await sql`
  SELECT COUNT(*) FILTER (WHERE active)::int active,
         COUNT(*) FILTER (WHERE active AND COALESCE(daily_rate,0) = 0)::int unrated,
         COUNT(*) FILTER (WHERE device_user_code IS NOT NULL)::int coded
  FROM attendance_workers WHERE tenant_id = ${tenant.id}`

console.log(`\nWRITTEN. ${added} added.`)
console.log(`  roster now: ${after.active} active, ${after.unrated} without a rate, ${after.coded} with a fingerprint id\n`)
console.log(`  NEXT: every one of them needs a daily rate. Until then the muster shows them but`)
console.log(`  refuses to cost a day, naming whoever is missing one.\n`)
console.log(`  Note for the cutover: their history splits labour into estate vs contract columns,`)
console.log(`  and lately every day reads estate 0 / outside 27 -- the whole roster in the outside`)
console.log(`  column. On the muster these are 28 individuals, so their cost lands in the ESTATE`)
console.log(`  column from the cutover on. A report spanning the line will show that mix flip. It`)
console.log(`  is more accurate, not less, but it will look like a change.\n`)
