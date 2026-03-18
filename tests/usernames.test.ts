import { describe, expect, it } from "vitest"
import {
  isReservedPlatformUsername,
  isSameUsername,
  isSystemUsername,
  normalizeUsername,
  normalizeUsernameLookup,
} from "../lib/usernames"

describe("username helpers", () => {
  it("normalizes username input for storage and lookup", () => {
    expect(normalizeUsername("  Alice  ")).toBe("Alice")
    expect(normalizeUsernameLookup("  Alice  ")).toBe("alice")
  })

  it("compares usernames case-insensitively after trimming", () => {
    expect(isSameUsername(" Admin ", "admin")).toBe(true)
    expect(isSameUsername("owner", "user")).toBe(false)
  })

  it("detects reserved usernames case-insensitively", () => {
    expect(isReservedPlatformUsername(" Owner ")).toBe(true)
    expect(isSystemUsername("system_bot")).toBe(true)
    expect(isSystemUsername("SYSTEM-OPS")).toBe(true)
    expect(isSystemUsername("field-user")).toBe(false)
  })
})
