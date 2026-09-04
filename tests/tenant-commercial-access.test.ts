import { describe, expect, it } from "vitest"

import {
  normalizeCommercialAccessSchemaError,
  resolveStoredTenantCommercialAccess,
  type TenantCommercialAccessRow,
} from "../lib/server/tenant-commercial-access"

const baseRow: TenantCommercialAccessRow = {
  tenant_id: "t1",
  plan_id: "starter",
  billing_provider: "razorpay",
  billing_status: "active",
  billing_customer_id: null,
  billing_subscription_id: null,
  billing_price_id: null,
  trial_started_at: null,
  trial_ends_at: null,
  current_period_started_at: null,
  current_period_ends_at: "2026-12-31T00:00:00.000Z",
  access_expires_at: null,
  cancel_at_period_end: false,
  canceled_at: null,
  last_synced_at: null,
  metadata: null,
}

describe("normalizeCommercialAccessSchemaError", () => {
  it("recognizes a missing tenant_commercial_access relation", () => {
    const err = normalizeCommercialAccessSchemaError(
      new Error('relation "tenant_commercial_access" does not exist'),
    )
    expect(err.message).toContain("scripts/74-tenant-commercial-access.sql")
  })

  it("recognizes a missing billing_provider column as the same schema gap", () => {
    const err = normalizeCommercialAccessSchemaError(new Error('column "billing_provider" does not exist'))
    expect(err.message).toContain("scripts/74-tenant-commercial-access.sql")
  })

  it("passes through an unrelated error message untouched", () => {
    const err = normalizeCommercialAccessSchemaError(new Error("connection refused"))
    expect(err.message).toBe("connection refused")
  })

  it("wraps a non-Error thrown value into a real Error", () => {
    const err = normalizeCommercialAccessSchemaError("boom")
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain("boom")
  })

  it("falls back to a generic message for an empty/falsy thrown value", () => {
    const err = normalizeCommercialAccessSchemaError(undefined)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe("Tenant commercial access lookup failed")
  })
})

describe("resolveStoredTenantCommercialAccess", () => {
  it("resolves an active, non-trial row as active with no trial stage", () => {
    const resolved = resolveStoredTenantCommercialAccess(baseRow, { now: new Date("2026-06-01") })
    expect(resolved.status).toBe("active")
    expect(resolved.stage).not.toBe("trial")
  })

  it("treats a missing row the same as no commercial-access record at all", () => {
    const resolved = resolveStoredTenantCommercialAccess(null, { now: new Date("2026-06-01") })
    const fromUndefined = resolveStoredTenantCommercialAccess(undefined, { now: new Date("2026-06-01") })
    expect(resolved).toEqual(fromUndefined)
  })

  it("expires a trial row once now passes trial_ends_at", () => {
    const trialRow: TenantCommercialAccessRow = {
      ...baseRow,
      billing_status: "trialing",
      trial_started_at: "2026-01-01T00:00:00.000Z",
      trial_ends_at: "2026-01-15T00:00:00.000Z",
    }
    const stillInTrial = resolveStoredTenantCommercialAccess(trialRow, { now: new Date("2026-01-10") })
    expect(stillInTrial.status).toBe("trialing")

    const afterTrial = resolveStoredTenantCommercialAccess(trialRow, { now: new Date("2026-01-20") })
    expect(afterTrial.status).toBe("expired")
  })
})
