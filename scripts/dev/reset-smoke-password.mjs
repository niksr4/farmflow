#!/usr/bin/env node
/**
 * Give the Estate Mock smoke account a fresh password on production, and store it where only this
 * machine can read it.
 *
 *   node --env-file=.env.local scripts/dev/reset-smoke-password.mjs --prod --yes
 *
 * WHY THIS EXISTS. scripts/dev/smoke-live.mjs signs in so it can call authenticated routes; without
 * a login it can only prove a route does not 500 *before* its auth check. The password committed
 * across ~20 files in scripts/dev/ is the DEV account's, and production's was unknown, so the
 * authenticated sweep was off.
 *
 * ⚠ WHY NOT REUSE THE DEV PASSWORD, OR SOMETHING MEMORABLE. **This repository is public.** A
 * password that appears in the repo -- or that anybody would guess from the username -- is a
 * working production credential published to the internet. Estate Mock holds only synthetic data,
 * but it is a real tenant on the real database with a real session, and a login there is a foothold
 * in production. So: 24 random characters from crypto, written ONLY to .env.local (gitignored,
 * never committed), and never printed to a terminal or a log.
 *
 * ⚠ WRITES TO PRODUCTION. One row, matched on username AND tenant name, and it refuses if that
 * does not resolve to exactly one user. Nothing else is touched.
 */
import { randomBytes, randomInt, scryptSync } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const USERNAME = "estate_mock"
const TENANT = "Estate Mock"
const SCRYPT_KEY_LENGTH = 64
// Same alphabet as generateTemporaryPassword in lib/passwords.ts -- no look-alike glyphs, so the
// value survives being read off a screen or pasted by hand.
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$!"

const flag = (n) => process.argv.includes(`--${n}`)

/**
 * Mirrors hashPassword() in lib/passwords.ts: `scrypt$<saltHex>$<hashHex>`, scryptSync with Node's
 * default cost. It cannot be imported here -- that module is TypeScript and this is a plain .mjs
 * script -- so the format is reproduced, and then VERIFIED by re-deriving it below and by actually
 * signing in with `pnpm smoke`. A hash in the wrong shape would be classified `legacy_plaintext`
 * by classifyStoredPasswordHash and rejected for login, which is a lockout, so this is checked
 * rather than assumed.
 */
const hashPassword = (password) => {
  const saltHex = randomBytes(16).toString("hex")
  const hashHex = scryptSync(password, saltHex, SCRYPT_KEY_LENGTH).toString("hex")
  return `scrypt$${saltHex}$${hashHex}`
}

const verify = (password, stored) => {
  const [scheme, saltHex, hashHex] = String(stored).split("$")
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, "hex")
  return scryptSync(password, saltHex, expected.length).equals(expected)
}

const envValue = (name, files) => {
  if (process.env[name]) return process.env[name]
  for (const f of files) {
    try {
      const m = readFileSync(f, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))
      if (m) return m[1].trim().replace(/^["']|["']$/g, "")
    } catch {}
  }
  return null
}

const isProd = flag("prod")
const url = isProd
  ? envValue("DATABASE_URL", [".env.vercel.production"])
  : envValue("DATABASE_URL_DEV", [".env.local"])

if (!url) {
  console.error(`No ${isProd ? "DATABASE_URL in .env.vercel.production" : "DATABASE_URL_DEV in .env.local"}.`)
  process.exit(1)
}

const sql = neon(url)
const target = isProd ? "PRODUCTION" : "dev"

console.log(`\nRESET SMOKE PASSWORD  (${target})`)
console.log(`  user: ${USERNAME} in tenant "${TENANT}"`)

// ── Resolve exactly one row ───────────────────────────────────────────────────────────────────
// username is unique per TENANT, not globally (uq_users_tenant_username), so matching on username
// alone could in principle hit another estate's user of the same name. Both halves are required.
const rows = await sql`
  SELECT u.id, u.username, t.name AS tenant, u.role
  FROM users u JOIN tenants t ON t.id = u.tenant_id
  WHERE u.username = ${USERNAME} AND t.name = ${TENANT}`

if (rows.length !== 1) {
  console.error(`\n⚠ Expected exactly 1 matching user, found ${rows.length}. Refusing to write.\n`)
  process.exit(1)
}
console.log(`  resolved: ${rows[0].id} (role ${rows[0].role})`)

if (!flag("yes")) {
  console.log("\nReport only. Re-run with --yes to actually change the password.\n")
  process.exit(0)
}

// ── Generate, hash, verify locally BEFORE writing ─────────────────────────────────────────────
let password = ""
for (let i = 0; i < 24; i += 1) password += CHARS[randomInt(CHARS.length)]
const hash = hashPassword(password)

if (!verify(password, hash)) {
  console.error("\n⚠ The hash does not verify against its own password. Refusing to write a lockout.\n")
  process.exit(1)
}
console.log(`  generated: ${password.length} chars, scrypt hash verified locally`)

// ── Write the one row ─────────────────────────────────────────────────────────────────────────
await sql`
  UPDATE users
  SET password_hash = ${hash},
      password_updated_at = now(),
      password_reset_required = false
  WHERE id = ${rows[0].id}::uuid`

const after = await sql`SELECT password_hash FROM users WHERE id = ${rows[0].id}::uuid`
if (!verify(password, after[0].password_hash)) {
  console.error("\n⚠ Stored hash does not verify. The account may be locked out -- investigate now.\n")
  process.exit(1)
}
console.log("  ✓ written, and the stored hash verifies against the new password")

// ── Store it where only this machine can read it ──────────────────────────────────────────────
const ENV = ".env.local"
let env = readFileSync(ENV, "utf8")
if (!env.endsWith("\n")) env += "\n"
const upsert = (body, key, value) =>
  new RegExp(`^${key}=.*$`, "m").test(body)
    ? body.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`)
    : `${body}${key}=${value}\n`
env = upsert(env, "SMOKE_USERNAME", USERNAME)
env = upsert(env, "SMOKE_PASSWORD", password)
writeFileSync(ENV, env)

console.log(`  ✓ SMOKE_USERNAME / SMOKE_PASSWORD written to ${ENV} (gitignored)`)
console.log("\n  The password is NOT printed. Read it from .env.local if you need it.")
console.log("  Verify end to end:  pnpm smoke\n")
