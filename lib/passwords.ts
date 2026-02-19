import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "crypto"

const SCRYPT_PREFIX = "scrypt"
const SCRYPT_KEY_LENGTH = 64
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$!"

type VerifyResult = {
  matches: boolean
  needsRehash: boolean
}

function safeEqual(left: Buffer, right: Buffer) {
  if (left.length !== right.length) {
    return false
  }
  return timingSafeEqual(Uint8Array.from(left), Uint8Array.from(right))
}

export function hashPassword(password: string) {
  const saltHex = randomBytes(16).toString("hex")
  const hashHex = scryptSync(password, saltHex, SCRYPT_KEY_LENGTH).toString("hex")
  return `${SCRYPT_PREFIX}$${saltHex}$${hashHex}`
}

export function verifyPassword(password: string, storedHash: string): VerifyResult {
  if (!storedHash) {
    return { matches: false, needsRehash: false }
  }

  if (storedHash.startsWith(`${SCRYPT_PREFIX}$`)) {
    const parts = storedHash.split("$")
    if (parts.length !== 3) {
      return { matches: false, needsRehash: false }
    }

    const saltHex = parts[1]
    const hashHex = parts[2]
    if (!saltHex || !hashHex) {
      return { matches: false, needsRehash: false }
    }

    const expected = Buffer.from(hashHex, "hex")
    const actual = scryptSync(password, saltHex, expected.length) as Buffer
    return { matches: safeEqual(actual, expected), needsRehash: false }
  }

  const legacyHash = createHash("sha256").update(password).digest("hex")
  const matches = safeEqual(Buffer.from(storedHash), Buffer.from(legacyHash))
  return { matches, needsRehash: matches }
}

export function generateTemporaryPassword(length = 12) {
  const safeLength = Number.isFinite(length) ? Math.max(10, Math.floor(length)) : 12
  let out = ""
  for (let i = 0; i < safeLength; i += 1) {
    out += TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)]
  }
  return out
}
