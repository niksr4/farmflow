import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "crypto"

const SCRYPT_PREFIX = "scrypt"
const SCRYPT_KEY_LENGTH = 64
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$!"
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i

type VerifyResult = {
  matches: boolean
  needsRehash: boolean
}

export type StoredPasswordScheme = "scrypt" | "legacy_sha256" | "legacy_plaintext" | "unknown"

function safeEqual(left: Buffer, right: Buffer) {
  if (left.length !== right.length) {
    return false
  }
  return timingSafeEqual(Uint8Array.from(left), Uint8Array.from(right))
}

export function classifyStoredPasswordHash(storedHash: string): StoredPasswordScheme {
  const normalizedStored = String(storedHash || "").trim()
  if (!normalizedStored) {
    return "unknown"
  }
  if (normalizedStored.startsWith(`${SCRYPT_PREFIX}$`)) {
    return "scrypt"
  }
  if (SHA256_HEX_PATTERN.test(normalizedStored)) {
    return "legacy_sha256"
  }
  return "legacy_plaintext"
}

export function hashPassword(password: string) {
  const saltHex = randomBytes(16).toString("hex")
  const hashHex = scryptSync(password, saltHex, SCRYPT_KEY_LENGTH).toString("hex")
  return `${SCRYPT_PREFIX}$${saltHex}$${hashHex}`
}

export function verifyPassword(password: string, storedHash: string): VerifyResult {
  const storedScheme = classifyStoredPasswordHash(storedHash)
  if (storedScheme === "unknown") {
    return { matches: false, needsRehash: false }
  }

  if (storedScheme === "scrypt") {
    try {
      const parts = String(storedHash).split("$")
      if (parts.length !== 3) {
        return { matches: false, needsRehash: false }
      }

      const saltHex = parts[1]
      const hashHex = parts[2]
      if (!saltHex || !hashHex) {
        return { matches: false, needsRehash: false }
      }

      const expected = Buffer.from(hashHex, "hex")
      if (expected.length === 0) {
        return { matches: false, needsRehash: false }
      }

      const actual = scryptSync(password, saltHex, expected.length) as Buffer
      return { matches: safeEqual(actual, expected), needsRehash: false }
    } catch {
      return { matches: false, needsRehash: false }
    }
  }

  if (storedScheme === "legacy_sha256") {
    const normalizedStored = String(storedHash).trim()
    const legacyHash = createHash("sha256").update(password).digest("hex")
    return { matches: normalizedStored.toLowerCase() === legacyHash, needsRehash: true }
  }

  // Plaintext-stored passwords are never accepted for login. Production has none (verified),
  // so this only closes the door on the worst-case scheme: any row that is still plaintext must
  // be reset by an admin rather than logged into. classifyStoredPasswordHash still reports
  // "legacy_plaintext" so such rows can be found and rotated.
  if (storedScheme === "legacy_plaintext") {
    return { matches: false, needsRehash: false }
  }

  return { matches: false, needsRehash: false }
}

export function generateTemporaryPassword(length = 12) {
  const safeLength = Number.isFinite(length) ? Math.max(10, Math.floor(length)) : 12
  let out = ""
  for (let i = 0; i < safeLength; i += 1) {
    out += TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)]
  }
  return out
}
