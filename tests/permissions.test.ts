import { describe, expect, it } from "vitest"
import { canDeleteModule, canWriteModule, requireAdminRole, requireOwnerRole } from "../lib/permissions"

describe("permissions matrix", () => {
  it("allows user writes for core data modules", () => {
    expect(canWriteModule("user", "processing")).toBe(true)
    expect(canWriteModule("user", "sales")).toBe(true)
    expect(canWriteModule("user", "rainfall")).toBe(true)
  })

  it("blocks user writes for non-data modules", () => {
    expect(canWriteModule("user", "news")).toBe(false)
    expect(canWriteModule("user", "weather")).toBe(false)
  })

  it("allows admin deletes and blocks user deletes", () => {
    expect(canDeleteModule("admin", "processing")).toBe(true)
    expect(canDeleteModule("owner", "processing")).toBe(true)
    expect(canDeleteModule("user", "processing")).toBe(false)
  })

  it("throws on admin/owner guards", () => {
    expect(() => requireAdminRole("user")).toThrow()
    expect(() => requireOwnerRole("admin")).toThrow()
    expect(() => requireAdminRole("owner")).not.toThrow()
  })
})
