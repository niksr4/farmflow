import { describe, expect, it } from "vitest"

import { inferLikelyCause, isKnownBenignCluster, isRoutineAuthRecovery } from "../lib/server/agents/log-anomaly-agent"

const cluster = (over: Partial<Parameters<typeof isKnownBenignCluster>[0]> = {}) => ({
  source: "next-auth",
  code: "auth_login_failure",
  currentCount: 4,
  severity: "medium" as const,
  ...over,
})

describe("routine account recovery is not an anomaly", () => {
  it("does not alert on the shape a forgotten password actually produces", () => {
    // Real 2026-08-03/04 sequence: an estate admin failed to sign in 4 times, requested a reset,
    // completed it, and logged in. That paged as "2 clusters requiring attention".
    expect(isRoutineAuthRecovery(cluster({ code: "auth_login_failure", currentCount: 4 }))).toBe(true)
    expect(isRoutineAuthRecovery(cluster({ code: "auth_password_reset_requested", currentCount: 1 }))).toBe(true)
    expect(isRoutineAuthRecovery(cluster({ code: "auth_password_reset_completed", currentCount: 1 }))).toBe(true)
  })

  it("covers the email-change codes so the new flow does not start paging too", () => {
    expect(isRoutineAuthRecovery(cluster({ code: "auth_email_change_requested", currentCount: 2 }))).toBe(true)
    expect(isRoutineAuthRecovery(cluster({ code: "auth_email_change_completed", currentCount: 2 }))).toBe(true)
  })

  it("STILL alerts when the volume looks like credential stuffing", () => {
    // The whole point of a threshold rather than a blanket exemption. Suppressing this code
    // outright would blind the alert to the attack it is the only early signal for.
    expect(isRoutineAuthRecovery(cluster({ currentCount: 13 }))).toBe(false)
    expect(isRoutineAuthRecovery(cluster({ currentCount: 500 }))).toBe(false)
    expect(isKnownBenignCluster(cluster({ currentCount: 500 }))).toBe(false)
  })

  it("never suppresses a high or critical cluster regardless of count", () => {
    expect(isRoutineAuthRecovery(cluster({ severity: "high", currentCount: 1 }))).toBe(false)
    expect(isRoutineAuthRecovery(cluster({ severity: "critical", currentCount: 1 }))).toBe(false)
  })

  it("leaves genuine application errors alerting", () => {
    expect(isKnownBenignCluster(cluster({ source: "api/sales", code: "insufficient_stock", currentCount: 2 }))).toBe(false)
    expect(isKnownBenignCluster(cluster({ source: "iclock/cdata", code: "biometric_punch_processing_failed", currentCount: 1 }))).toBe(false)
  })

  it("keeps the pre-existing admin permission-change suppression working", () => {
    expect(isKnownBenignCluster(cluster({ source: "admin/users", code: "permission_change", currentCount: 3 }))).toBe(true)
    // ...but not the same code from a non-admin source.
    expect(isKnownBenignCluster(cluster({ source: "api/rogue", code: "permission_change", currentCount: 3 }))).toBe(false)
  })
})

describe("likely-cause text", () => {
  const base = { message: "", endpoint: "", source: "next-auth", severity: "medium" as const }

  it("stops calling a forgotten password an application regression", () => {
    const cause = inferLikelyCause({ ...base, code: "auth_login_failure" })
    expect(cause).not.toContain("regression")
    expect(cause).toContain("Account recovery")
    expect(cause).toContain("credential stuffing")
  })

  it("still names credential stuffing as the thing to look for", () => {
    expect(inferLikelyCause({ ...base, code: "auth_password_reset_requested" })).toContain("credential stuffing")
  })

  it("leaves the other diagnostic branches intact", () => {
    expect(inferLikelyCause({ ...base, code: "x", message: 'relation "foo" does not exist' })).toContain("migration")
    expect(inferLikelyCause({ ...base, code: "x", message: "fetch failed" })).toContain("dependency/network")
    expect(inferLikelyCause({ ...base, code: "x", message: "duplicate key 23505" })).toContain("idempotency")
    expect(inferLikelyCause({ ...base, code: "x", message: "boom", severity: "critical" })).toContain("Critical error cluster")
  })
})
