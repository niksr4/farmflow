import { describe, it, expect } from "vitest"
import { roleLabel } from "@/lib/roles"

describe("roleLabel", () => {
  it("maps known roles to estate-facing labels", () => {
    expect(roleLabel("owner")).toBe("Platform Owner")
    expect(roleLabel("admin")).toBe("Estate Admin")
    expect(roleLabel("user")).toBe("Estate User")
  })

  it("is case-insensitive", () => {
    expect(roleLabel("OWNER")).toBe("Platform Owner")
    expect(roleLabel("Admin")).toBe("Estate Admin")
  })

  it("echoes an unknown non-empty role verbatim", () => {
    expect(roleLabel("supervisor")).toBe("supervisor")
  })

  it("falls back to 'User' for empty/nullish input", () => {
    expect(roleLabel("")).toBe("User")
    expect(roleLabel(null)).toBe("User")
    expect(roleLabel(undefined)).toBe("User")
  })
})
