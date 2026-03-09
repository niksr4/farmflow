import { describe, expect, it } from "vitest"
import { canDeleteModule, canWriteModule, requireAdminRole, requireOwnerRole } from "../lib/permissions"

describe("permissions matrix", () => {
  it("allows user writes for core data modules", () => {
    expect(canWriteModule("user", "processing")).toBe(true)
    expect(canWriteModule("user", "other-sales")).toBe(true)
    expect(canWriteModule("user", "rainfall")).toBe(true)
  })

  it("blocks user writes for non-data modules", () => {
    expect(canWriteModule("user", "sales")).toBe(false)
    expect(canWriteModule("user", "news")).toBe(false)
    expect(canWriteModule("user", "weather")).toBe(false)
  })

  it("allows deletes for user on mutation modules", () => {
    expect(canDeleteModule("admin", "processing")).toBe(true)
    expect(canDeleteModule("owner", "processing")).toBe(true)
    expect(canDeleteModule("user", "processing")).toBe(true)
    expect(canDeleteModule("user", "other-sales")).toBe(true)
  })

  it("blocks user deletes for non-mutation modules", () => {
    expect(canDeleteModule("user", "sales")).toBe(false)
    expect(canDeleteModule("user", "news")).toBe(false)
    expect(canDeleteModule("user", "weather")).toBe(false)
  })

  it("throws on admin/owner guards", () => {
    expect(() => requireAdminRole("user")).toThrow()
    expect(() => requireOwnerRole("admin")).toThrow()
    expect(() => requireAdminRole("owner")).not.toThrow()
  })
})
