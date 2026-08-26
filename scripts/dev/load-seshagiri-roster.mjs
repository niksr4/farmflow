/**
 * Put Seshagiri's 27 employees on the roster, with their fingerprint ids.
 *
 * Run: node --env-file=.env.local scripts/dev/load-seshagiri-roster.mjs [prod]           (dry run)
 *      node --env-file=.env.local scripts/dev/load-seshagiri-roster.mjs [prod] --commit
 *
 * From their SmartHCM export of 25 Aug 2026. This is the thing Seshagiri have been blocked on: they
 * were cut over to the muster on 24 Aug with zero workers, which meant typed labour was refused and
 * the muster was empty -- they could not record labour at all. The cutover changed a flag; this is
 * what gives them a workflow.
 *
 * FINGERPRINT IDS GO IN NOW, BEFORE THE SCANNER. The employee number is the enrolment id, and
 * `device_user_code` is what the relay matches punches against. They are enterable ahead of the
 * hardware since showFingerIds stopped being gated on a device existing -- so the terminal works
 * the day it is installed rather than needing 27 names re-entered against it.
 *
 * NUTHAN AND EASHWAR HAVE NO RATE, and that is the correct state rather than missing data. The
 * export says "Monthly" for both, which is not a day rate. monthly_wage exists to hold the amount
 * (scripts/141) but the export does not carry it, so it is left null and they appear in the
 * roster's "needs a wage" list. Storing 0 would claim a day of their time costs nothing; putting
 * the salary in daily_rate would make it Rs X times days worked the moment either is marked
 * present.
 *
 * ESTATE IS SET, unlike HoneyFarm's load. There the export said "HoneyFarm" for everyone, which is
 * the company, and the tenant runs two estates -- guessing would have hidden anyone at Sidapur from
 * the roll they belong on. Seshagiri run one estate and the export names it, so there is nothing to
 * guess.
 */
import { neon } from "@neondatabase/serverless"

const isProd = process.argv.includes("prod")
const commit = process.argv.includes("--commit")
const sql = neon(isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV)

const ESTATE = "Seshagiri"

/** [fingerprint id, name, type, daily rate, gender] straight off the export. */
const ROSTER = [
  [1, "Nuthan", "staff_pf", null, "male"],
  [2, "Eashwar", "staff", null, "male"],
  [3, "Gowramma", "chkroll_pf", 494, "female"],
  [4, "Kala", "chkroll_pf", 494, "male"],
  [5, "Manju", "chkroll_pf", 494, "male"],
  [6, "Rani", "chkroll_pf", 494, "female"],
  [7, "Susheela", "chkroll_pf", 494, "female"],
  [14, "Prema", "chkroll_pf", 494, "female"],
  [15, "Nagaraju", "chkroll_pf", 494, "male"],
  [19, "Siddi", "chkroll_pf", 494, "female"],
  [22, "Chandra", "casuals", 494, "male"],
  [23, "Meena", "casuals", 494, "female"],
  [24, "Padma", "casuals", 494, "female"],
  [31, "Mallesha", "casuals", 494, "male"],
  [32, "Narayana", "casuals", 494, "male"],
  [33, "Kunja", "casuals", 494, "male"],
  [36, "Kavya", "casuals", 494, "female"],
  [37, "Jajaja", "casuals", 494, "female"],
  [39, "Bahar Ali", "seasonal_assam", 450, "male"],
  [40, "Morjina", "seasonal_assam", 450, "female"],
  [41, "Maibul", "seasonal_assam", 450, "male"],
  [50, "Mamuni", "seasonal_assam", 450, "female"],
  [51, "Sumar Ali", "seasonal_assam", 450, "male"],
  [52, "Anufu", "seasonal_assam", 450, "female"],
  [53, "Abdulmoas", "seasonal_assam", 450, "male"],
  [100, "Fulesh", "seasonal_assam", 450, "female"],
  [103, "Rakibul", "seasonal_assam", 450, "male"],
]

const [tenant] = await sql`SELECT id FROM tenants WHERE name = 'Seshagiri'`
if (!tenant) { console.error(`No Seshagiri tenant on ${isProd ? "PROD" : "dev"}.`); process.exit(1) }

const existing = await sql`
  SELECT device_user_code, full_name FROM attendance_workers WHERE tenant_id = ${tenant.id}`
const byCode = new Map(existing.filter((w) => w.device_user_code).map((w) => [String(w.device_user_code), w]))

console.log(`\n=== ${isProd ? "PRODUCTION" : "dev"} — Seshagiri roster ===\n`)
console.log(`  on the roster now : ${existing.length}`)
console.log(`  in the export     : ${ROSTER.length}\n`)

const byType = {}
for (const [, , type, rate] of ROSTER) {
  byType[type] ??= { n: 0, rate }
  byType[type].n += 1
}
for (const [type, v] of Object.entries(byType))
  console.log(`    ${type.padEnd(16)} ${String(v.n).padStart(2)} people  ${v.rate == null ? "paid monthly — no daily rate" : "Rs " + v.rate + "/day"}`)

const women = ROSTER.filter((r) => r[4] === "female").length
console.log(`\n  gender: ${women} female, ${ROSTER.length - women} male  (INDICOFS 4.6.2I)`)
console.log(`  estate: ${ESTATE} — the export names it and they run one`)

if (!commit) { console.log("\nDry run. Re-run with --commit to write.\n"); process.exit(0) }

let added = 0
let updated = 0
for (const [code, name, type, rate, gender] of ROSTER) {
  if (byCode.has(String(code))) {
    await sql`
      UPDATE attendance_workers
      SET full_name = ${name}, worker_type = ${type}, daily_rate = ${rate}, gender = ${gender},
          estate = ${ESTATE}, active = true
      WHERE tenant_id = ${tenant.id} AND device_user_code = ${String(code)}`
    updated += 1
  } else {
    await sql`
      INSERT INTO attendance_workers
        (tenant_id, full_name, active, worker_type, daily_rate, gender, estate, device_user_code, kind)
      VALUES (${tenant.id}, ${name}, true, ${type}, ${rate}, ${gender}, ${ESTATE}, ${String(code)}, 'individual')`
    added += 1
  }
}

const [after] = await sql`
  SELECT COUNT(*) FILTER (WHERE active)::int active,
         COUNT(*) FILTER (WHERE active AND COALESCE(daily_rate,0) = 0)::int no_rate,
         COUNT(*) FILTER (WHERE device_user_code IS NOT NULL)::int coded
  FROM attendance_workers WHERE tenant_id = ${tenant.id}`

console.log(`\nWRITTEN. ${added} added, ${updated} updated.`)
console.log(`  roster now: ${after.active} active, ${after.coded} with a fingerprint id`)
console.log(`  ${after.no_rate} without a daily rate — Nuthan and Eashwar, who are paid monthly.`)
console.log(`  Their monthly amounts are not in the export; the field is on the roster when you have them.\n`)
console.log(`  Seshagiri can now record labour. They were cut over on 24 Aug with an empty roster,`)
console.log(`  which meant typed labour was refused and the muster had nobody on it.\n`)
