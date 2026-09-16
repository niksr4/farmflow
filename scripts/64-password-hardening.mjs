import { randomBytes, scryptSync } from "node:crypto"
import { neon } from "@neondatabase/serverless"

const SCRYPT_PREFIX = "scrypt"
const SCRYPT_KEY_LENGTH = 64
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i

const hasFlag = (flag) => process.argv.includes(flag)

const resolveDatabaseUrl = () => {
  const normalizedDev = String(process.env.DATABASE_URL_DEV || "").trim()
  const normalizedProd = String(process.env.DATABASE_URL || "").trim()
  if (process.env.NODE_ENV === "production") {
    return normalizedProd
  }
  return normalizedDev || normalizedProd
}

const classifyStoredPasswordHash = (storedHash) => {
  const normalized = String(storedHash || "").trim()
  if (!normalized) return "unknown"
  if (normalized.startsWith(`${SCRYPT_PREFIX}$`)) return "scrypt"
  if (SHA256_HEX_PATTERN.test(normalized)) return "legacy_sha256"
  return "legacy_plaintext"
}

/**
 * Stored values that are deliberately NOT credentials, and must never be turned into one.
 *
 * ⚠ `--apply-plaintext` re-hashes the value ALREADY IN THE COLUMN. That is correct for a genuine
 * legacy plaintext password -- the user knows it, and hashing it in place preserves their login
 * while removing the plaintext. It is catastrophic for a PLACEHOLDER: scripts/17 seeds a fresh
 * owner row with `NO-LOGIN-set-a-password-through-the-app`, which is printed in a public
 * repository, and hashing that in place would mint a valid owner credential that anybody can read
 * off GitHub. Worse than the published SHA-256 hash that migration was fixed to remove, because a
 * published plaintext needs no cracking.
 *
 * Raised by Greptile on PR #23, against the migration's remediation advice. Blocked here as well
 * as there, because guidance in a comment is not a control.
 */
const NON_CREDENTIAL_SENTINELS = new Set(["NO-LOGIN-set-a-password-through-the-app"])

const isNonCredentialSentinel = (value) => NON_CREDENTIAL_SENTINELS.has(String(value || "").trim())

const hashPassword = (password) => {
  const saltHex = randomBytes(16).toString("hex")
  const hashHex = scryptSync(password, saltHex, SCRYPT_KEY_LENGTH).toString("hex")
  return `${SCRYPT_PREFIX}$${saltHex}$${hashHex}`
}

const updatePasswordHash = async (sql, row, nextHash) => {
  try {
    await sql`
      UPDATE users
      SET password_hash = ${nextHash},
          password_reset_required = TRUE,
          password_updated_at = CURRENT_TIMESTAMP
      WHERE id = ${row.id}
    `
    return
  } catch (error) {
    const message = String(error?.message || error)
    if (!message.includes('column "password_reset_required"') && !message.includes('column "password_updated_at"')) {
      throw error
    }
  }

  await sql`
    UPDATE users
    SET password_hash = ${nextHash}
    WHERE id = ${row.id}
  `
}

const markPasswordResetRequired = async (sql, row) => {
  try {
    await sql`
      UPDATE users
      SET password_reset_required = TRUE
      WHERE id = ${row.id}
    `
    return true
  } catch (error) {
    const message = String(error?.message || error)
    if (!message.includes('column "password_reset_required"')) {
      throw error
    }
    return false
  }
}

const main = async () => {
  const databaseUrl = resolveDatabaseUrl()
  if (!databaseUrl) {
    throw new Error("Database not configured. Set DATABASE_URL_DEV or DATABASE_URL.")
  }

  const sql = neon(databaseUrl)
  const applyPlaintext = hasFlag("--apply-plaintext")
  const flagLegacySha = hasFlag("--flag-legacy-sha")

  const rows = await sql`
    SELECT id, username, tenant_id, password_hash
    FROM users
    ORDER BY created_at ASC
  `

  const summary = {
    total: rows.length,
    scrypt: 0,
    legacy_sha256: 0,
    legacy_plaintext: 0,
    unknown: 0,
  }

  const plaintextRows = []
  const shaRows = []

  for (const row of rows) {
    const scheme = classifyStoredPasswordHash(row.password_hash)
    summary[scheme] += 1
    if (scheme === "legacy_plaintext") {
      plaintextRows.push(row)
    } else if (scheme === "legacy_sha256") {
      shaRows.push(row)
    }
  }

  console.log("Password storage audit")
  console.log(JSON.stringify(summary, null, 2))

  if (!applyPlaintext && !flagLegacySha) {
    console.log("")
    console.log("No changes applied.")
    console.log("Use --apply-plaintext to re-hash plaintext legacy passwords in place.")
    console.log("Use --flag-legacy-sha to mark SHA-256 legacy users for forced reset.")
    return
  }

  if (applyPlaintext) {
    const skipped = plaintextRows.filter((row) => isNonCredentialSentinel(row.password_hash))
    const rehashable = plaintextRows.filter((row) => !isNonCredentialSentinel(row.password_hash))

    for (const row of rehashable) {
      const nextHash = hashPassword(String(row.password_hash || "").trim())
      await updatePasswordHash(sql, row, nextHash)
    }
    console.log(`Re-hashed ${rehashable.length} plaintext legacy password record(s).`)

    if (skipped.length) {
      console.log("")
      console.log(
        `REFUSED to re-hash ${skipped.length} placeholder record(s). These are not passwords -- ` +
          "hashing one in place would mint a credential whose plaintext is published in this " +
          "repository. Set a real password for them through the app or the admin console:",
      )
      for (const row of skipped) console.log(`  - ${row.username || row.id}`)
    }
  }

  if (flagLegacySha) {
    let flagged = 0
    for (const row of shaRows) {
      const updated = await markPasswordResetRequired(sql, row)
      if (updated) flagged += 1
    }
    console.log(`Flagged ${flagged} SHA-256 legacy password record(s) for forced reset.`)
    if (flagged !== shaRows.length) {
      console.log("Some SHA-256 rows could not be flagged because password_reset_required is missing.")
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
