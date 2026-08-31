/**
 * Set up "a random estate has just bought a scanner" — then get out of the way.
 *
 * Run: node --env-file=.env.local scripts/dev/scanner-scenario.mjs
 *      node --env-file=.env.local scripts/dev/scanner-scenario.mjs --reset   (tear the estate down again)
 *
 * WHY IT ONLY SETS UP THE STARTING CONDITIONS. The question being tested is whether an estate can
 * connect a terminal without anyone from FarmFlow involved. Every step this script performs on
 * their behalf is a step the test no longer covers. So it creates a genuinely blank estate through
 * the real signup endpoints -- same provisioning, same 87 activity codes, same trial -- and stops.
 * No workers, no device, no fingerprint ids. Everything after this is done in the browser, by you,
 * pretending you have never seen the codebase.
 *
 * It also frees the scanner's serial. Serial numbers are globally unique across all tenants
 * (biometric_devices_serial_number_unique), which is right -- one physical box belongs to one
 * estate -- but it means the pilot registration under Estate Mock would block the new estate from
 * claiming the same hardware. That collision is itself worth testing on purpose; see the note the
 * script prints at the end.
 */
import { neon } from "@neondatabase/serverless"
import { createHash, randomBytes } from "node:crypto"

const BASE = process.env.SCENARIO_BASE_URL || "http://localhost:3000"
const SERIAL = process.env.SCENARIO_SERIAL || "AMDB25062800863"
const RESET = process.argv.includes("--reset")

const sql = neon(process.env.DATABASE_URL_DEV)

// Stable so re-running does not litter the dev database with half-built estates.
const ESTATE = "Kodagu Test Estate"
// Resend refuses example.com outright, so a real signup cannot be driven with a fake domain.
// delivered@resend.dev is their sink address: it accepts and delivers nowhere.
const EMAIL = "delivered@resend.dev"
const PASSWORD = "ScannerTrial!2026"
const OWNER = "Ravi Somaiah"

const line = (s = "") => console.log(s)

const dropEstate = async () => {
  const rows = await sql`SELECT id FROM tenants WHERE name = ${ESTATE}`
  for (const row of rows) {
    // ON DELETE CASCADE off tenants clears users, workers, codes, devices and punches with it.
    await sql`DELETE FROM tenants WHERE id = ${row.id}`
  }
  await sql`DELETE FROM signup_requests WHERE email = ${EMAIL}`
  return rows.length
}

if (RESET) {
  const n = await dropEstate()
  line(`\nRemoved ${n} tenant(s) named "${ESTATE}" and any signup request for ${EMAIL}.`)
  line("The scanner's serial is left as it is -- re-run without --reset to set the scenario up again.\n")
  process.exit(0)
}

// ── 0. Is the dev server actually up? Everything below goes through it on purpose. ───────────
try {
  await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) })
} catch {
  line(`\nNothing answering on ${BASE}. Start it with: pnpm dev\n`)
  process.exit(1)
}

// ── 1. A clean slate, so a re-run is a fresh scenario and not a half-finished one. ────────────
const removed = await dropEstate()
if (removed) line(`(cleared ${removed} previous run)`)

// ── 3. Sign up, exactly the way a stranger would. ─────────────────────────────────────────────
const signup = await fetch(`${BASE}/api/auth/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: OWNER,
    email: EMAIL,
    password: PASSWORD,
    estateName: ESTATE,
    country: "India",
    source: "scanner-scenario",
  }),
})
const signupBody = await signup.json().catch(() => ({}))
if (!signup.ok || !signupBody?.success) {
  line(`\nSignup failed (${signup.status}): ${signupBody?.error || "unknown"}`)
  process.exit(1)
}

// ── 4. Click the verification link.
//
// Only the token's HASH is stored (lib/server/onboarding/utils.ts), which is correct -- a leaked
// database should not hand out working verification links. So the plaintext cannot be read back,
// and dev sends no mail. A fresh token is minted here and its hash written over the stored one,
// which substitutes the email delivery and nothing else: /api/auth/verify-email still does the
// real verification and the real provisioning.
const [request] = await sql`
  SELECT id FROM signup_requests WHERE email = ${EMAIL} ORDER BY created_at DESC LIMIT 1`
if (!request?.id) {
  line("\nSigned up, but no signup_request row exists — cannot continue.")
  process.exit(1)
}

const token = randomBytes(32).toString("hex")
const tokenHash = createHash("sha256").update(`farmflow-signup:${token}`).digest("hex")
const updated = await sql`
  UPDATE signup_tokens SET token_hash = ${tokenHash}
  WHERE signup_request_id = ${request.id} AND purpose = 'verify_email'
  RETURNING id`
if (updated.length === 0) {
  line("\nNo verify_email token row to stand in for the email — cannot continue.")
  process.exit(1)
}

const verify = await fetch(`${BASE}/api/auth/verify-email`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token }),
})
const verifyBody = await verify.json().catch(() => ({}))
if (!verify.ok || !verifyBody?.success) {
  line(`\nVerification failed (${verify.status}): ${verifyBody?.error || "unknown"}`)
  process.exit(1)
}

// ── 5. Only now free the serial. Doing it before the estate exists meant a signup that failed
// for an unrelated reason -- Resend rejecting the email domain, on the first run of this script --
// left the pilot registration deleted and nothing to show for it. Destructive steps go last.
const claimed = await sql`
  SELECT d.id, d.label, t.name AS tenant
  FROM biometric_devices d JOIN tenants t ON t.id = d.tenant_id
  WHERE d.serial_number = ${SERIAL}`
for (const row of claimed) {
  // Punches survive: biometric_punches.device_id is ON DELETE SET NULL and they still carry
  // device_serial, so nothing already recorded is lost by unregistering the box.
  await sql`DELETE FROM biometric_devices WHERE id = ${row.id}`
  line(`(released serial ${SERIAL} from ${row.tenant} — "${row.label}")`)
}

// ── 6. Report what the estate now has, and pointedly what it does not. ────────────────────────
const [tenant] = await sql`SELECT id, name FROM tenants WHERE name = ${ESTATE} LIMIT 1`
const [user] = await sql`SELECT username, role FROM users WHERE tenant_id = ${tenant.id} LIMIT 1`
const [counts] = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM account_activities WHERE tenant_id = ${tenant.id})  AS codes,
    (SELECT COUNT(*)::int FROM attendance_workers WHERE tenant_id = ${tenant.id})  AS workers,
    (SELECT COUNT(*)::int FROM biometric_devices WHERE tenant_id = ${tenant.id})   AS devices,
    (SELECT COUNT(*)::int FROM locations WHERE tenant_id = ${tenant.id})           AS locations`

line()
line(`  ESTATE      ${tenant.name}`)
line(`  SIGN IN     ${BASE}/login`)
line(`  USERNAME    ${user?.username}`)
line(`  PASSWORD    ${PASSWORD}`)
line()
line(`  Provisioned: ${counts.codes} activity codes, ${counts.locations} location(s).`)
line(`  Deliberately empty: ${counts.workers} workers, ${counts.devices} devices, 0 fingerprint ids.`)
line()
line(`  The scanner on the desk is serial ${SERIAL} and is now registered to nobody.`)
line()
line("  From here on, do it as the estate would -- in the browser, with no shortcuts:")
line("    1. Sign in, add a few workers on the roster.")
line("    2. Accounts -> Attendance -> Scanner, and follow what the screen tells you.")
line("    3. Power the terminal on, put it on the same WiFi, type in the address the tab gives you.")
line("    4. Put a finger on it. The punch should appear in the tab without you touching a database.")
line()
line("  Anything you have to work out for yourself, or ask me, is the finding.")
line()
line("  Worth running afterwards as its own scenario: register the same serial a second time from")
line("  a different estate. That is a second-hand scanner, and today it fails with \"already")
line("  registered\" and no way for either estate to resolve it alone.")
line()
line(`  Tear it all down again: node --env-file=.env.local scripts/dev/scanner-scenario.mjs --reset`)
line()
