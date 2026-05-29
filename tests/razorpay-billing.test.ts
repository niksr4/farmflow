import { createHmac } from "crypto"
import { describe, expect, it } from "vitest"

import {
  getRazorpayPublicConfig,
  razorpayStatusToCommercialStatus,
  resolveRazorpayPlanId,
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
