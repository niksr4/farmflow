import { createHmac } from "crypto"
import { describe, expect, it } from "vitest"

import {
  getRazorpayPublicConfig,
  razorpayStatusToCommercialStatus,
  resolveRazorpayPlanId,
  unixSecondsToIso,
  verifyRazorpayWebhookSignature,
} from "../lib/server/billing/razorpay"

describe("razorpay billing helpers", () => {
  it("resolves plan ids from environment variables", () => {
    expect(
      resolveRazorpayPlanId("core", "monthly", {
        RAZORPAY_PLAN_CORE_MONTHLY_ID: "plan_core_monthly_123",
      }),
    ).toBe("plan_core_monthly_123")
  })

  it("maps authenticated future-start subscriptions to trialing", () => {
    expect(
      razorpayStatusToCommercialStatus("authenticated", {
        startAt: Math.floor(new Date("2026-05-01T00:00:00.000Z").getTime() / 1000),
        now: new Date("2026-04-01T00:00:00.000Z"),
      }),
    ).toBe("trialing")
  })

  it("maps lifecycle statuses into the app commercial model", () => {
    expect(razorpayStatusToCommercialStatus("active")).toBe("active")
    expect(razorpayStatusToCommercialStatus("pending")).toBe("past_due")
    expect(razorpayStatusToCommercialStatus("halted")).toBe("unpaid")
    expect(razorpayStatusToCommercialStatus("cancelled")).toBe("canceled")
    expect(razorpayStatusToCommercialStatus("completed")).toBe("expired")
  })

  it("verifies webhook signatures against the raw payload", () => {
    const payload = JSON.stringify({ event: "subscription.activated", id: "evt_123" })
    const secret = "whsec_test_secret"
    const signature = createHmac("sha256", secret).update(payload).digest("hex")

    expect(verifyRazorpayWebhookSignature(payload, signature, secret)).toBe(true)
    expect(verifyRazorpayWebhookSignature(payload, "wrong", secret)).toBe(false)
  })

  it("refuses to verify when the webhook secret is not configured", () => {
    // RAZORPAY_WEBHOOK_SECRET is deliberately unset in production while billing enforcement is
    // deferred, so /api/billing/webhooks/razorpay calls this with an empty secret on every
    // request. It must fail closed — a truthy result here would let anyone forge subscription
    // state changes against an unauthenticated endpoint.
    const payload = JSON.stringify({ event: "subscription.activated", id: "evt_123" })
    const signature = createHmac("sha256", "whsec_test_secret").update(payload).digest("hex")

    expect(verifyRazorpayWebhookSignature(payload, signature, "")).toBe(false)
    expect(verifyRazorpayWebhookSignature(payload, signature, "   ")).toBe(false)
    expect(verifyRazorpayWebhookSignature(payload, signature, undefined as unknown as string)).toBe(false)
  })

  it("refuses to verify an empty signature or an empty payload", () => {
    const payload = JSON.stringify({ event: "subscription.activated", id: "evt_123" })
    const secret = "whsec_test_secret"
    const signature = createHmac("sha256", secret).update(payload).digest("hex")

    expect(verifyRazorpayWebhookSignature(payload, "", secret)).toBe(false)
    expect(verifyRazorpayWebhookSignature(payload, "   ", secret)).toBe(false)
    expect(verifyRazorpayWebhookSignature("", signature, secret)).toBe(false)
  })

  it("rejects a signature computed over a different payload or a different secret", () => {
    const payload = JSON.stringify({ event: "subscription.activated", id: "evt_123" })
    const secret = "whsec_test_secret"

    const otherPayloadSignature = createHmac("sha256", secret)
      .update(JSON.stringify({ event: "subscription.cancelled", id: "evt_123" }))
      .digest("hex")
    const otherSecretSignature = createHmac("sha256", "whsec_other").update(payload).digest("hex")

    expect(verifyRazorpayWebhookSignature(payload, otherPayloadSignature, secret)).toBe(false)
    expect(verifyRazorpayWebhookSignature(payload, otherSecretSignature, secret)).toBe(false)
  })

  it("tolerates signatures of any length without throwing", () => {
    // Both sides are hashed to a fixed width before timingSafeEqual, which would otherwise
    // throw on a length mismatch and surface as a 500 instead of a clean 401.
    const payload = JSON.stringify({ event: "subscription.activated" })
    const secret = "whsec_test_secret"

    expect(() => verifyRazorpayWebhookSignature(payload, "a", secret)).not.toThrow()
    expect(verifyRazorpayWebhookSignature(payload, "a".repeat(500), secret)).toBe(false)
  })

  it("converts unix seconds to ISO strings and treats missing values as null", () => {
    expect(unixSecondsToIso(Math.floor(Date.UTC(2026, 4, 1) / 1000))).toBe("2026-05-01T00:00:00.000Z")
    expect(unixSecondsToIso(null)).toBeNull()
    expect(unixSecondsToIso(undefined)).toBeNull()
    expect(unixSecondsToIso(0)).toBeNull()
    expect(unixSecondsToIso(Number.NaN)).toBeNull()
    expect(unixSecondsToIso(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it("throws rather than returning null for an out-of-range timestamp (known edge)", () => {
    // Characterisation test: a finite but absurd value passes the guard and then blows up in
    // toISOString(). The webhook route calls this six times on provider-supplied fields, so a
    // malformed value fails the whole event. See findings_log.md, cycle 1 files 31-45.
    expect(() => unixSecondsToIso(1e15)).toThrow(RangeError)
  })

  it("reports which public Razorpay pieces are configured", () => {
    expect(
      getRazorpayPublicConfig({
        RAZORPAY_KEY_ID: "rzp_test_123",
        RAZORPAY_KEY_SECRET: "secret",
        RAZORPAY_WEBHOOK_SECRET: "whsec",
        RAZORPAY_PLAN_BASIC_MONTHLY_ID: "plan_basic",
        RAZORPAY_PLAN_CORE_MONTHLY_ID: "plan_core",
      }),
    ).toEqual({
      configured: true,
      keyId: "rzp_test_123",
      plans: {
        basic: true,
        core: true,
        enterprise: false,
      },
    })
  })
})
