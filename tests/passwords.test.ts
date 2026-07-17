import { describe, it, expect } from "vitest"
import {
  classifyStoredPasswordHash,
  hashPassword,
  verifyPassword,
  generateTemporaryPassword,
} from "@/lib/passwords"
import { createHash } from "crypto"

describe("classifyStoredPasswordHash", () => {
  it("recognises the scrypt scheme", () => {
    expect(classifyStoredPasswordHash(hashPassword("x"))).toBe("scrypt")
  })
  it("recognises a legacy sha256 hex digest", () => {
    expect(classifyStoredPasswordHash("a".repeat(64))).toBe("legacy_sha256")
  })
  it("treats other non-empty values as legacy plaintext", () => {
    expect(classifyStoredPasswordHash("hunter2")).toBe("legacy_plaintext")
  })
  it("returns unknown for empty input", () => {
    expect(classifyStoredPasswordHash("")).toBe("unknown")
    expect(classifyStoredPasswordHash("   ")).toBe("unknown")
  })
})

describe("hashPassword / verifyPassword (scrypt)", () => {
  it("produces a salted scrypt$salt$hash string with a random salt", () => {
    const a = hashPassword("correct horse")
    const b = hashPassword("correct horse")
    expect(a.split("$")).toHaveLength(3)
    expect(a.startsWith("scrypt$")).toBe(true)
    expect(a).not.toBe(b) // random salt ⇒ different ciphertext for the same password
  })

  it("verifies the correct password and needs no rehash", () => {
    const stored = hashPassword("s3cret-pass")
    expect(verifyPassword("s3cret-pass", stored)).toEqual({ matches: true, needsRehash: false })
  })

  it("rejects the wrong password", () => {
    const stored = hashPassword("s3cret-pass")
    expect(verifyPassword("wrong", stored).matches).toBe(false)
  })

  it("rejects a malformed scrypt hash without throwing", () => {
    expect(verifyPassword("x", "scrypt$onlytwo")).toEqual({ matches: false, needsRehash: false })
  })
})

describe("verifyPassword (legacy schemes flag a rehash)", () => {
  it("matches a legacy sha256 hash and signals rehash", () => {
    const legacy = createHash("sha256").update("old-pass").digest("hex")
    expect(verifyPassword("old-pass", legacy)).toEqual({ matches: true, needsRehash: true })
    expect(verifyPassword("nope", legacy).matches).toBe(false)
  })

  it("never accepts a plaintext-stored password (must be admin-reset), though it is still classified", () => {
    // Hardening: plaintext acceptance was removed. A plaintext row cannot be logged into.
    expect(classifyStoredPasswordHash("plain")).toBe("legacy_plaintext")
    expect(verifyPassword("plain", "plain")).toEqual({ matches: false, needsRehash: false })
  })

  it("never matches against an empty stored hash", () => {
    expect(verifyPassword("anything", "")).toEqual({ matches: false, needsRehash: false })
  })
})

describe("generateTemporaryPassword", () => {
  const SAFE = /^[A-HJ-NP-Za-km-z2-9@#$!]+$/ // excludes ambiguous 0/O/1/I/l

  it("defaults to a 12-char password from the safe charset", () => {
    const pw = generateTemporaryPassword()
    expect(pw).toHaveLength(12)
    expect(pw).toMatch(SAFE)
  })

  it("enforces a minimum length of 10", () => {
    expect(generateTemporaryPassword(4).length).toBe(10)
  })

  it("honours a longer requested length", () => {
    expect(generateTemporaryPassword(20).length).toBe(20)
  })

  it("produces distinct values across calls", () => {
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword())
  })
})
