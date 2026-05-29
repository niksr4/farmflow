import { describe, expect, it } from "vitest"

import {
  buildTenantTrialDefaults,
  normalizeBillingProvider,
  normalizeCommercialAccessStatus,
  resolveLegacyCommercialAccess,
  resolveTenantCommercialAccess,
} from "../lib/commercial-access"

describe("commercial access", () => {
  it("keeps legacy tenants active when no billing record exists yet", () => {
    expect(resolveLegacyCommercialAccess("basic")).toMatchObject({
      billingProvider: "manual",
      planId: "basic",
      status: "active",
      accessActive: true,
      stage: "paid",
    })
  })

  it("builds a 30-day trial window by default", () => {
    const trial = buildTenantTrialDefaults("enterprise", {
      now: new Date("2026-04-01T00:00:00.000Z"),
    })

    expect(trial).toMatchObject({
      planId: "enterprise",
      billingProvider: "none",
      status: "trialing",
      trialStartedAt: "2026-04-01T00:00:00.000Z",
      trialEndsAt: "2026-05-01T00:00:00.000Z",
      accessEndsAt: "2026-05-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    })
  })

  it("keeps active trials entitled until the trial end", () => {
    const access = resolveTenantCommercialAccess(
      {
        billingProvider: "stripe",
        planId: "core",
        status: "trialing",
        trialStartedAt: "2026-04-01T00:00:00.000Z",
        trialEndsAt: "2026-04-30T00:00:00.000Z",
      },
      { now: new Date("2026-04-15T00:00:00.000Z") },
    )

    expect(access).toMatchObject({
      billingProvider: "stripe",
      planId: "core",
      status: "trialing",
      trialActive: true,
      accessActive: true,
      stage: "trial",
    })
  })

  it("expires trials after the deadline passes", () => {
    const access = resolveTenantCommercialAccess(
      {
        planId: "core",
        status: "trialing",
        trialEndsAt: "2026-04-30T00:00:00.000Z",
      },
      { now: new Date("2026-05-02T00:00:00.000Z") },
    )

    expect(access).toMatchObject({
      status: "expired",
      trialActive: false,
      accessActive: false,
      stage: "inactive",
    })
  })

  it("keeps past-due tenants in grace until access ends", () => {
    const access = resolveTenantCommercialAccess(
      {
        billingProvider: "stripe",
        planId: "core",
        status: "past_due",
        currentPeriodEndsAt: "2026-04-10T00:00:00.000Z",
      },
      { now: new Date("2026-04-05T00:00:00.000Z") },
    )

    expect(access).toMatchObject({
      status: "past_due",
      accessActive: true,
      needsPaymentMethod: true,
      stage: "grace",
    })
  })

  it("normalizes unknown provider and status values safely", () => {
    expect(normalizeBillingProvider("something-else")).toBe("none")
    expect(normalizeCommercialAccessStatus("something-else")).toBe("active")
  })
})
