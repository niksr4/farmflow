import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto"

const SCRYPT_PREFIX = "scrypt"
const SCRYPT_KEY_LENGTH = 64

type VerifyResult = {
  matches: boolean
  needsRehash: boolean
}

function safeEqual(left: Buffer, right: Buffer) {
  if (left.length !== right.length) {
    return false
  }
  return timingSafeEqual(left, right)
}

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH)
  return `${SCRYPT_PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`
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

    const salt = Buffer.from(saltHex, "hex")
    const expected = Buffer.from(hashHex, "hex")
    const actual = scryptSync(password, salt, expected.length)
    return { matches: safeEqual(actual, expected), needsRehash: false }
  }

  const legacyHash = createHash("sha256").update(password).digest("hex")
  const matches = safeEqual(Buffer.from(storedHash), Buffer.from(legacyHash))
  return { matches, needsRehash: matches }
}
