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
    for (const row of plaintextRows) {
      const nextHash = hashPassword(String(row.password_hash || "").trim())
      await updatePasswordHash(sql, row, nextHash)
    }
    console.log(`Re-hashed ${plaintextRows.length} plaintext legacy password record(s).`)
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
