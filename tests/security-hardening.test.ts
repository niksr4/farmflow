import { afterEach, describe, expect, it } from "vitest"

import { classifyStoredPasswordHash, hashPassword, verifyPassword } from "../lib/passwords"
import { formatBodyLimit, parseContentLengthHeader, resolveApiBodyLimit } from "../lib/request-limits"
import {
  decryptSensitiveJson,
  decryptSensitiveText,
  encryptSensitiveJson,
  encryptSensitiveText,
  isEncryptedText,
} from "../lib/field-encryption"

const originalNextAuthSecret = process.env.NEXTAUTH_SECRET

afterEach(() => {
  process.env.NEXTAUTH_SECRET = originalNextAuthSecret
})

describe("security hardening helpers", () => {
  it("classifies modern and legacy password records and requests rehash for legacy matches", () => {
    const scryptHash = hashPassword("StrongPass123!")
    expect(classifyStoredPasswordHash(scryptHash)).toBe("scrypt")
    expect(verifyPassword("StrongPass123!", scryptHash)).toEqual({ matches: true, needsRehash: false })

    const shaHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    expect(classifyStoredPasswordHash(shaHash)).toBe("legacy_sha256")
    expect(verifyPassword("hello", shaHash)).toEqual({ matches: true, needsRehash: true })

    expect(classifyStoredPasswordHash("plaintext-password")).toBe("legacy_plaintext")
    expect(verifyPassword("plaintext-password", "plaintext-password")).toEqual({ matches: true, needsRehash: true })
  })

  it("encrypts and decrypts text and json payloads for app-layer sensitive fields", () => {
    process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-nextauth-secret-for-security-hardening"

    const encryptedText = encryptSensitiveText("sensitive text")
    expect(isEncryptedText(encryptedText)).toBe(true)
    expect(decryptSensitiveText(encryptedText)).toBe("sensitive text")

    const encryptedJson = encryptSensitiveJson({ reason: "delete me" })
    expect(decryptSensitiveJson(encryptedJson)).toEqual({ reason: "delete me" })
    expect(decryptSensitiveJson({ reason: "legacy plain json" })).toEqual({ reason: "legacy plain json" })
  })

  it("resolves request size limits for sensitive routes and formats user-facing limits", () => {
    expect(resolveApiBodyLimit("/api/auth/signup", "application/json")).toBe(32 * 1024)
    expect(resolveApiBodyLimit("/api/documents", "multipart/form-data; boundary=abc")).toBe(11 * 1024 * 1024)
    expect(resolveApiBodyLimit("/api/anything-else", "application/json")).toBe(512 * 1024)
    expect(parseContentLengthHeader("2048")).toBe(2048)
    expect(parseContentLengthHeader("bad")).toBeNull()
    expect(formatBodyLimit(11 * 1024 * 1024)).toBe("11 MB")
  })
})
