import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildAdminErrorResponse, isAuthRefusal } from "@/lib/server/route-utils"

/**
 * A guard turning someone away is the system working. It was being reported as a fault.
 *
 * Two Sentry issues -- "Error: Owner role required" on /api/admin/tenants and
 * /api/admin/system-health -- sat unresolved because every admin route's catch block called
 * logServerError before deciding the status. The status was already correct (403); the report was
 * not. Reporting a working permission check as a server error trains everyone to ignore the
 * dashboard, which is how the one that matters gets missed.
 */
describe("a refusal is recognised as a refusal", () => {
  it("knows the role messages", () => {
    for (const m of ["Owner role required", "Admin role required", "Unauthorized", "Insufficient role"]) {
      expect(isAuthRefusal(new Error(m)), m).toBe(true)
    }
  })

  it("does not swallow anything else", () => {
    // The failure mode to avoid is the opposite one: a real fault classed as a refusal and never
    // reported at all.
    for (const m of ["column \"id\" does not exist", "Insufficient stock for Urea", "boom", ""]) {
      expect(isAuthRefusal(new Error(m)), m).toBe(false)
    }
    expect(isAuthRefusal(null)).toBe(false)
    expect(isAuthRefusal({ nope: true })).toBe(false)
  })
})

describe("the response was always right; only the logging was wrong", () => {
  it("an owner refusal is a 403, not a 500", async () => {
    const res = buildAdminErrorResponse(new Error("Owner role required"), "fallback", { ownerRequired: true })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("Owner role required")
  })

  it("a genuine fault is still a 500 and keeps its fallback message", async () => {
    const res = buildAdminErrorResponse(new Error("relation does not exist"), "Failed to load", { ownerRequired: true })
    expect(res.status).toBe(500)
  })
})

describe("no admin route reports a refusal to Sentry", () => {
  const files = [
    "app/api/admin/tenants/route.ts",
    "app/api/admin/users/route.ts",
    "app/api/admin/system-health/route.ts",
  ]

  it.each(files)("%s guards every logServerError that precedes an admin error response", (file) => {
    const src = readFileSync(file, "utf8")
    // Each catch that returns buildAdminErrorResponse must not log unconditionally.
    const unguarded = src.match(/\n\s*logServerError\([^)]*\)\n\s*return buildAdminErrorResponse\(/g) ?? []
    expect(unguarded, `${file} logs a refusal as a server error`).toEqual([])
  })

  it.each(files)("%s actually imports the predicate it uses", (file) => {
    const src = readFileSync(file, "utf8")
    if (!src.includes("isAuthRefusal(")) return
    expect(src).toMatch(/import \{[^}]*isAuthRefusal[^}]*\} from "@\/lib\/server\/route-utils"/)
  })
})
