import { describe, it, expect } from "vitest"
import { isPublicApiPath, PUBLIC_API_PREFIXES } from "@/lib/public-routes"

describe("isPublicApiPath", () => {
  it("allows next-auth and signup endpoints", () => {
    expect(isPublicApiPath("/api/auth/signup")).toBe(true)
    expect(isPublicApiPath("/api/auth/session")).toBe(true)
    expect(isPublicApiPath("/api/auth/verify-email")).toBe(true)
  })

  it("allows the public routes that were previously 401'd by the incomplete allowlist", () => {
    // Regression: these public callers (contact form, QR lot page, email feedback link) must
    // reach their route without a session.
    expect(isPublicApiPath("/api/contact")).toBe(true)
    expect(isPublicApiPath("/api/lots/HF-A-2401")).toBe(true)
    expect(isPublicApiPath("/api/digest/feedback")).toBe(true)
  })

  it("allows secret-authenticated system endpoints", () => {
    expect(isPublicApiPath("/api/cron/orchestrator")).toBe(true)
    expect(isPublicApiPath("/api/ops/error-ingest")).toBe(true)
    expect(isPublicApiPath("/api/billing/webhooks/razorpay")).toBe(true)
  })

  it("requires a session for tenant data routes", () => {
    expect(isPublicApiPath("/api/sales")).toBe(false)
    expect(isPublicApiPath("/api/inventory-neon")).toBe(false)
    expect(isPublicApiPath("/api/dashboard/bootstrap")).toBe(false)
    expect(isPublicApiPath("/api/admin/users")).toBe(false)
    expect(isPublicApiPath("/api/expenses-neon")).toBe(false)
  })

  it("does not allow lookalike routes that only share a prefix (segment-boundary match)", () => {
    expect(isPublicApiPath("/api/lots-export")).toBe(false)
    expect(isPublicApiPath("/api/contacts-list")).toBe(false)
    expect(isPublicApiPath("/api/authenticate")).toBe(false)
  })

  it("every allowlist entry targets the /api namespace", () => {
    for (const prefix of PUBLIC_API_PREFIXES) {
      expect(prefix.startsWith("/api/")).toBe(true)
    }
  })
})
