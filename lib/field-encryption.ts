import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto"

const TEXT_ENCRYPTION_PREFIX = "enc:v1:"
const JSON_ENCRYPTION_VERSION = "enc:v1"
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const KEY_BYTES = 32

type EncryptedJsonEnvelope = {
  _encrypted: typeof JSON_ENCRYPTION_VERSION
  value: string
}

let cachedKey: Uint8Array | null = null

const resolveEncryptionSecret = () => {
  const explicit = String(process.env.APP_DATA_ENCRYPTION_KEY || "").trim()
  if (explicit) {
    return explicit
  }

  const fallback = String(process.env.NEXTAUTH_SECRET || "").trim()
  if (fallback) {
    // Not set up with its own key — reusing the session secret means rotating
    // NEXTAUTH_SECRET (e.g. for session security) will also break decryption of
    // already-encrypted fields. Set APP_DATA_ENCRYPTION_KEY to decouple the two.
    console.warn(
      "APP_DATA_ENCRYPTION_KEY is not set — falling back to NEXTAUTH_SECRET for field encryption. " +
        "Rotating NEXTAUTH_SECRET will break decryption of existing encrypted fields.",
    )
    return fallback
  }

  throw new Error("Application data encryption key missing. Set APP_DATA_ENCRYPTION_KEY or NEXTAUTH_SECRET.")
}

const resolveEncryptionKey = () => {
  if (cachedKey) {
    return cachedKey
  }
  cachedKey = Uint8Array.from(scryptSync(resolveEncryptionSecret(), "farmflow-app-data:v1", KEY_BYTES))
  return cachedKey
}

const concatBytes = (...chunks: Uint8Array[]) => {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export const isEncryptedText = (value: string | null | undefined) =>
  String(value || "").startsWith(TEXT_ENCRYPTION_PREFIX)

export const encryptSensitiveText = (plaintext: string) => {
  if (!plaintext) return plaintext

  const iv = Uint8Array.from(randomBytes(IV_BYTES))
  const cipher = createCipheriv("aes-256-gcm", resolveEncryptionKey(), iv)
  const ciphertext = concatBytes(Uint8Array.from(cipher.update(plaintext, "utf8")), Uint8Array.from(cipher.final()))
  const authTag = Uint8Array.from(cipher.getAuthTag())
  return `${TEXT_ENCRYPTION_PREFIX}${Buffer.from(concatBytes(iv, authTag, ciphertext)).toString("base64url")}`
}

export const decryptSensitiveText = (value: string) => {
  if (!isEncryptedText(value)) {
    return value
  }

  const payload = Buffer.from(value.slice(TEXT_ENCRYPTION_PREFIX.length), "base64url")
  const iv = Uint8Array.from(payload.subarray(0, IV_BYTES))
  const authTag = Uint8Array.from(payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES))
  const ciphertext = Uint8Array.from(payload.subarray(IV_BYTES + AUTH_TAG_BYTES))
  const decipher = createDecipheriv("aes-256-gcm", resolveEncryptionKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.from(
    concatBytes(Uint8Array.from(decipher.update(ciphertext)), Uint8Array.from(decipher.final())),
  ).toString("utf8")
}

const isEncryptedJsonEnvelope = (value: unknown): value is EncryptedJsonEnvelope =>
  Boolean(value) &&
  typeof value === "object" &&
  (value as Record<string, unknown>)._encrypted === JSON_ENCRYPTION_VERSION &&
  typeof (value as Record<string, unknown>).value === "string"

export const encryptSensitiveJson = (value: unknown) => {
  if (value === null || value === undefined) return null
  return {
    _encrypted: JSON_ENCRYPTION_VERSION,
    value: encryptSensitiveText(JSON.stringify(value)),
  }
}

export const decryptSensitiveJson = <T = unknown>(value: unknown): T => {
  if (!isEncryptedJsonEnvelope(value)) {
    return value as T
  }
  return JSON.parse(decryptSensitiveText(value.value)) as T
}
