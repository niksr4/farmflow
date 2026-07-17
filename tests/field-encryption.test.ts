import { describe, it, expect, beforeAll } from "vitest"

// The module resolves its key lazily and caches it, so set a deterministic key before use.
beforeAll(() => {
  process.env.APP_DATA_ENCRYPTION_KEY = "unit-test-encryption-key"
})

const load = async () => await import("@/lib/field-encryption")

describe("encryptSensitiveText / decryptSensitiveText", () => {
  it("round-trips text through AES-256-GCM", async () => {
    const { encryptSensitiveText, decryptSensitiveText } = await load()
    const plain = "Account 4021 · ₹1,25,000 · buyer Seshagiri"
    const cipher = encryptSensitiveText(plain)
    expect(cipher).not.toBe(plain)
    expect(cipher.startsWith("enc:v1:")).toBe(true)
    expect(decryptSensitiveText(cipher)).toBe(plain)
  })

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encryptSensitiveText } = await load()
    expect(encryptSensitiveText("same")).not.toBe(encryptSensitiveText("same"))
  })

  it("passes through empty input and non-encrypted values unchanged", async () => {
    const { encryptSensitiveText, decryptSensitiveText } = await load()
    expect(encryptSensitiveText("")).toBe("")
    expect(decryptSensitiveText("plain, not encrypted")).toBe("plain, not encrypted")
  })

  it("detects the encrypted prefix", async () => {
    const { isEncryptedText, encryptSensitiveText } = await load()
    expect(isEncryptedText(encryptSensitiveText("x"))).toBe(true)
    expect(isEncryptedText("x")).toBe(false)
    expect(isEncryptedText(null)).toBe(false)
  })

  it("throws when the auth tag / ciphertext is tampered with", async () => {
    const { encryptSensitiveText, decryptSensitiveText } = await load()
    const cipher = encryptSensitiveText("sensitive")
    const tampered = cipher.slice(0, -4) + (cipher.endsWith("AAAA") ? "BBBB" : "AAAA")
    expect(() => decryptSensitiveText(tampered)).toThrow()
  })
})

describe("encryptSensitiveJson / decryptSensitiveJson", () => {
  it("round-trips structured data", async () => {
    const { encryptSensitiveJson, decryptSensitiveJson } = await load()
    const value = { account: "4021", amount: 125000, tags: ["labour", "harvest"] }
    const envelope = encryptSensitiveJson(value)
    expect(envelope).not.toBeNull()
    expect((envelope as { _encrypted: string })._encrypted).toBe("enc:v1")
    expect(decryptSensitiveJson(envelope)).toEqual(value)
  })

  it("returns null for null/undefined", async () => {
    const { encryptSensitiveJson } = await load()
    expect(encryptSensitiveJson(null)).toBeNull()
    expect(encryptSensitiveJson(undefined)).toBeNull()
  })

  it("passes a non-envelope value through decrypt unchanged", async () => {
    const { decryptSensitiveJson } = await load()
    expect(decryptSensitiveJson({ plain: true })).toEqual({ plain: true })
  })
})
