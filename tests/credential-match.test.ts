import { describe, it, expect } from "vitest"
import { classifyCredentialMatches } from "@/lib/credential-match"

describe("classifyCredentialMatches", () => {
  it("is not ambiguous when a username matches exactly one tenant", () => {
    const result = classifyCredentialMatches(["tenant-a"], false)
    expect(result.ambiguous).toBe(false)
    expect(result.distinctTenants).toBe(1)
  })

  it("flags a username that matches across two different estates", () => {
    const result = classifyCredentialMatches(["tenant-a", "tenant-b"], false)
    expect(result.ambiguous).toBe(true)
    expect(result.distinctTenants).toBe(2)
  })

  it("is not ambiguous when multiple matches are all the same tenant", () => {
    // e.g. duplicate rows within one estate — still one estate, so not ambiguous
    const result = classifyCredentialMatches(["tenant-a", "tenant-a"], false)
    expect(result.ambiguous).toBe(false)
    expect(result.distinctTenants).toBe(1)
  })

  it("never flags email logins as ambiguous (email is globally unique)", () => {
    const result = classifyCredentialMatches(["tenant-a", "tenant-b"], true)
    expect(result.ambiguous).toBe(false)
    expect(result.distinctTenants).toBe(2)
  })

  it("handles no matches", () => {
    const result = classifyCredentialMatches([], false)
    expect(result.ambiguous).toBe(false)
    expect(result.distinctTenants).toBe(0)
  })

  it("ignores null/empty tenant ids when counting distinct estates", () => {
    const result = classifyCredentialMatches(["tenant-a", null, undefined, ""], false)
    expect(result.distinctTenants).toBe(1)
    expect(result.ambiguous).toBe(false)
  })
})
