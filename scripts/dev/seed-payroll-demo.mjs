#!/usr/bin/env node
// Seed a dev tenant with pay rules and ledger history, so the Workers money panel can be looked at
// in every state it has instead of an empty box.
//
// DEV ONLY. It refuses to run against a connection string that does not look like the dev database,
// because the rows it writes are money against named workers and this is exactly the script somebody
// runs at the wrong moment with the wrong env loaded.
//
//   node scripts/dev/seed-payroll-demo.mjs                 # seed
//   node scripts/dev/seed-payroll-demo.mjs --clean         # remove everything it wrote
//
// Everything it writes is tagged `[demo]` in the description / created_by, and --clean removes
// exactly that. It never touches a row it did not create.

import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const clean = process.argv.includes("--clean")
const TAG = "[demo]"

function envValue(name) {
  if (process.env[name]) return process.env[name]
  for (const file of [".env.local", ".env"]) {
    try {
      const line = readFileSync(file, "utf8").split("\n").find((l) => l.startsWith(`${name}=`))
      if (line) return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "")
    } catch {
      /* next */
    }
  }
  return null
}

const url = envValue("DATABASE_URL_DEV")
if (!url) {
  console.error("✗ DATABASE_URL_DEV not found. This script does not fall back to DATABASE_URL on purpose.")
  process.exit(2)
}

const sql = neon(url)

// The tenant to demo against. A name with "dev" or "mock" in it, never a real estate — the point of
// the dev database is that it holds copies, and a copy is what should be scribbled on.
const TENANT_NAME_LIKE = "%dev copy%"

async function main() {
  const tenants = await sql`SELECT id, name FROM tenants WHERE name ILIKE ${TENANT_NAME_LIKE} LIMIT 1`
  if (!tenants.length) {
    console.error(`✗ No tenant matching "${TENANT_NAME_LIKE}". Refusing to guess at a real one.`)
    process.exit(2)
  }
  const tenant = tenants[0]
  console.log(`Tenant: ${tenant.name} (${tenant.id})`)

  if (clean) {
    const l = await sql`DELETE FROM worker_ledger WHERE tenant_id = ${tenant.id} AND description LIKE ${"%" + TAG + "%"} RETURNING id`
    const r = await sql`DELETE FROM worker_pay_rules WHERE tenant_id = ${tenant.id} AND created_by = ${TAG} RETURNING id`
    console.log(`✓ Removed ${l.length} ledger row(s) and ${r.length} rule(s).`)
    return
  }

  const workers = await sql`
    SELECT id, full_name, daily_rate FROM attendance_workers
    WHERE tenant_id = ${tenant.id} AND active AND kind = 'individual' AND daily_rate > 0
    ORDER BY full_name LIMIT 3
  `
  if (workers.length < 3) {
    console.error("✗ Need at least 3 rated individual workers to show the different states.")
    process.exit(2)
  }
  const [ravi, suma, ganesh] = workers

  // 1. Medappa's actual rule, as Manoj stated it on 2026-09-08:
  //      retention 20% of the day's pay, unchanged by any wage rise (the percentage is what is
  //      fixed, not the rupees), a half day retaining 20% of the half-day wage;
  //      a normal working day of 8 hours, which is the divisor for the hourly overtime rate;
  //      overtime at 1.2x that hourly rate -- Rs 600 / 8 = Rs 75, x1.2 = Rs 90 an hour.
  await sql`
    INSERT INTO worker_pay_rules (
      tenant_id, worker_id, effective_from,
      retention_mode, retention_value, overtime_mode, overtime_value, full_day_hours, created_by
    )
    VALUES (${tenant.id}, NULL, '2026-04-01'::date, 'percent_of_day', 20, 'multiplier_of_hourly', 1.2, 8, ${TAG})
    ON CONFLICT (tenant_id, effective_from) WHERE worker_id IS NULL
    DO UPDATE SET
      retention_mode  = EXCLUDED.retention_mode,
      retention_value = EXCLUDED.retention_value,
      overtime_mode   = EXCLUDED.overtime_mode,
      overtime_value  = EXCLUDED.overtime_value,
      full_day_hours  = EXCLUDED.full_day_hours,
      created_by      = EXCLUDED.created_by
  `

  // 2. One worker exempted outright, to show an override beating the default. An all-null rule is
  //    how a rule is switched off without deleting what already accrued under it.
  await sql`
    INSERT INTO worker_pay_rules (tenant_id, worker_id, effective_from, created_by)
    VALUES (${tenant.id}, ${ganesh.id}::uuid, '2026-06-01'::date, ${TAG})
    ON CONFLICT (tenant_id, worker_id, effective_from) WHERE worker_id IS NOT NULL
    DO UPDATE SET created_by = EXCLUDED.created_by
  `

  const entries = [
    // Ravi: retention building up, an advance being recovered over ten runs, one cash repayment.
    [ravi.id, "2026-06-30", "retention_accrual", 2760, `Retention · June ${TAG}`, 1],
    [ravi.id, "2026-07-31", "retention_accrual", 2880, `Retention · July ${TAG}`, 1],
    [ravi.id, "2026-08-12", "advance", 20000, `School fees ${TAG}`, 10],
    [ravi.id, "2026-08-31", "retention_accrual", 2640, `Retention · August ${TAG}`, 1],
    [ravi.id, "2026-09-01", "repayment", 5000, `Returned in cash ${TAG}`, 1],
    // Suma: retention only, nothing owed — the ordinary case.
    [suma.id, "2026-07-31", "retention_accrual", 2520, `Retention · July ${TAG}`, 1],
    [suma.id, "2026-08-31", "retention_accrual", 2520, `Retention · August ${TAG}`, 1],
    // Ganesh: exempt from retention, but has taken a small advance recovered in one go.
    [ganesh.id, "2026-08-20", "advance", 1500, `Advance ${TAG}`, 1],
  ]

  for (const [workerId, date, type, amount, description, periods] of entries) {
    await sql`
      INSERT INTO worker_ledger (tenant_id, worker_id, entry_date, entry_type, amount, description, recover_over_periods, created_by)
      VALUES (${tenant.id}, ${workerId}::uuid, ${date}::date, ${type}, ${amount}, ${description}, ${periods}, ${TAG})
    `
  }

  console.log(`✓ Seeded ${entries.length} ledger rows and 2 rules.`)
  console.log(`
  Open Labour → Workers and expand a row:

    ${ravi.full_name.padEnd(22)} retention held, Rs 20,000 advance over 10 runs, Rs 5,000 repaid
    ${suma.full_name.padEnd(22)} retention only, owes nothing
    ${ganesh.full_name.padEnd(22)} exempt from retention (override), owes Rs 1,500

  Undo with:  node scripts/dev/seed-payroll-demo.mjs --clean
`)
}

main().catch((e) => {
  console.error("✗", e?.message || e)
  process.exit(1)
})
