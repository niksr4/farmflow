import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL_DEV)

const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const SERIAL = "AMDB25062800863" // the real BioMax N-WL20; change if you point a different unit at dev

// --- estates: Estate Mock mirrors HoneyFarm, because that is the shape being tested against ----
// It used to invent 'Hill Estate'/'Valley Estate' over whatever blocks existed. Estate Mock is now
// shaped by scripts/dev/shape-estate-mock-like-honeyfarm.mjs -- two estates, a general location
// holding the cost, one shared shed -- and re-inventing names here would silently undo it between
// one harness run and the next. Blocks are matched by CODE, which that script deliberately keeps.
await sql`UPDATE locations SET estate='Honeyfarm' WHERE tenant_id=${T} AND code IN ('HF','HF-AC','HF-B')`
await sql`UPDATE locations SET estate='Sidapur'   WHERE tenant_id=${T} AND code IN ('MV','PG','SIDAPUR-GEN')`
await sql`UPDATE locations SET estate=NULL        WHERE tenant_id=${T} AND kind='store'`
// Real blocks get coordinates + area so cost-per-acre is exercisable. The general locations get
// neither: they are not land, and an area on one would enter a denominator it does not belong in.
await sql`UPDATE locations SET latitude=12.415, longitude=75.739, area_acres=4.5  WHERE tenant_id=${T} AND code='HF-AC'`
await sql`UPDATE locations SET latitude=12.421, longitude=75.744, area_acres=7.25 WHERE tenant_id=${T} AND code='HF-B'`

// --- roster: 8 individuals with finger IDs, 1 gang, 1 person with no finger enrolled --------
await sql`DELETE FROM labour_assignments WHERE tenant_id=${T}`
await sql`DELETE FROM attendance_records  WHERE tenant_id=${T}`
await sql`DELETE FROM attendance_workers  WHERE tenant_id=${T}`

const hill = (await sql`SELECT id FROM locations WHERE tenant_id=${T} AND code='HF-AC'`)[0].id
const people = [
  ["Ponnappa M", "1", 600], ["Sunitha K", "2", 600], ["Bopanna A", "3", 800],
  ["Kaveri S", "4", 600],   ["Somaiah P", "5", 600], ["Muthanna B", "6", 800],
  ["Leela D", "7", 600],    ["Ganesh R", "8", 600],
]
for (const [name, finger, rate] of people) {
  await sql`INSERT INTO attendance_workers (tenant_id, full_name, active, worker_type, daily_rate,
                                            device_user_code, kind, estate)
            VALUES (${T}, ${name}, TRUE, 'permanent', ${rate}, ${finger}, 'individual', 'Hill Estate')`
}
// No finger enrolled — proves a worker the scanner cannot see is still markable by hand.
await sql`INSERT INTO attendance_workers (tenant_id, full_name, active, worker_type, daily_rate, kind, estate)
          VALUES (${T}, 'Ramesh N (no finger)', TRUE, 'seasonal', 600, 'individual', 'Valley Estate')`
// A contract gang — one row, a headcount, no fingerprints.
await sql`INSERT INTO attendance_workers (tenant_id, full_name, active, worker_type, daily_rate, kind, headcount)
          VALUES (${T}, 'Rathi & Team', TRUE, 'contractor', 600, 'gang', 11)`

// --- the scanner itself ----------------------------------------------------------------------
// The serial is globally unique -- a device resolves to exactly one tenant -- so move it rather
// than insert a second row. In dev it was registered to HoneyFarm from earlier relay testing.
await sql`DELETE FROM biometric_devices WHERE serial_number=${SERIAL}`
await sql`INSERT INTO biometric_devices (tenant_id, serial_number, label, active)
          VALUES (${T}, ${SERIAL}, 'Morning-flow test — BioMax N-WL20', TRUE)`

const w = await sql`SELECT full_name, kind, headcount, device_user_code, estate, daily_rate
                    FROM attendance_workers WHERE tenant_id=${T} ORDER BY kind DESC, full_name`
console.table(w.map((r) => ({
  worker: r.full_name, kind: r.kind, heads: r.headcount ?? "-",
  fingerId: r.device_user_code ?? "— none —", estate: r.estate ?? "-", rate: r.daily_rate,
})))
const l = await sql`SELECT name, estate, area_acres FROM locations WHERE tenant_id=${T} ORDER BY estate, name`
console.table(l.map((r) => ({ block: r.name, estate: r.estate, acres: r.area_acres ?? "-" })))
console.log(`\nscanner registered: ${SERIAL}`)
console.log(`point the device at:  http://192.168.68.63:3000/iclock/cdata?SN=${SERIAL}`)
