import { NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminRole } from "@/lib/permissions"
import { TENANT_PLAN_IDS } from "@/lib/modules"
import { createRazorpaySubscription, type RazorpayBillingCycle } from "@/lib/server/billing/razorpay"
import { requireSessionUser } from "@/lib/server/auth"
import { isDbConfigured, sql } from "@/lib/server/db"
import { resolveScopedSessionUser } from "@/lib/server/module-access"
import { logProductIntelligenceEvent } from "@/lib/server/product-intelligence-events"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import {
  loadTenantCommercialAccess,
  resolveStoredTenantCommercialAccess,
  saveTenantCommercialAccess,
} from "@/lib/server/tenant-commercial-access"

export const dynamic = "force-dynamic"

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const CHECKOUT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

const checkoutBodySchema = z.object({
  planId: z.enum(TENANT_PLAN_IDS),
  billingCycle: z.enum(["monthly"]).optional().default("monthly"),
})

export async function POST(request: Request) {
  if (!isDbConfigured) {
    return databaseNotConfiguredResponse()
  }

  try {
    const sessionUser = await resolveScopedSessionUser(await requireSessionUser())
    requireAdminRole(sessionUser.role)

    const body = await request.json().catch(() => ({}))
    const parsed = checkoutBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid checkout payload" },
        { status: 400 },
      )
    }

    const existing = await loadTenantCommercialAccess(sql, sessionUser.tenantId, sessionUser.role)
    const resolvedExisting = resolveStoredTenantCommercialAccess(existing)
    const now = new Date()

    if (
      existing?.billing_provider === "razorpay" &&
      existing?.billing_subscription_id &&
      (resolvedExisting.stage === "trial" || resolvedExisting.stage === "paid" || resolvedExisting.stage === "grace")
    ) {
      return NextResponse.json(
        { success: false, error: "An active Razorpay subscription already exists for this workspace" },
        { status: 409 },
      )
    }

    const startAt =
      resolvedExisting.trialActive && resolvedExisting.trialEndsAt
        ? new Date(resolvedExisting.trialEndsAt)
        : new Date(now.getTime() + THIRTY_DAYS_MS)

    const checkout = await createRazorpaySubscription({
      planId: parsed.data.planId,
      billingCycle: parsed.data.billingCycle as RazorpayBillingCycle,
      startAt,
      expireBy: new Date(now.getTime() + CHECKOUT_EXPIRY_MS),
      notes: {
        tenant_id: sessionUser.tenantId,
        tenant_plan_id: parsed.data.planId,
        created_by: sessionUser.username,
        source: "farmflow",
      },
    })

    const nextStatus = resolvedExisting.trialActive ? "trialing" : resolvedExisting.accessActive ? "active" : "incomplete"
    const existingMetadata =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {}

    await saveTenantCommercialAccess(sql, sessionUser.tenantId, sessionUser.role, {
      planId: parsed.data.planId,
      billingProvider: "razorpay",
      status: nextStatus,
      billingSubscriptionId: checkout.id,
      billingPriceId: checkout.plan_id,
      accessExpiresAt: resolvedExisting.trialActive ? resolvedExisting.trialEndsAt : existing?.access_expires_at ?? null,
      metadata: {
        ...existingMetadata,
        razorpay: {
          createdCheckoutAt: now.toISOString(),
          checkoutMode: "hosted_subscription_link",
          checkoutUrl: checkout.short_url || null,
          lastRequestedPlanId: parsed.data.planId,
          lastRequestedBillingCycle: parsed.data.billingCycle,
          plannedTrialEndsAt: startAt.toISOString(),
        },
      },
    })

    await logProductIntelligenceEvent({
      tenantId: sessionUser.tenantId,
      actorUserId: sessionUser.id,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "billing_checkout_created",
      moduleId: "billing",
      source: "billing/checkout",
      metadata: {
        provider: "razorpay",
        planId: parsed.data.planId,
        billingCycle: parsed.data.billingCycle,
        subscriptionId: checkout.id,
      },
    })

    return NextResponse.json({
      success: true,
      provider: "razorpay",
      checkoutMode: "hosted_subscription_link",
      subscriptionId: checkout.id,
      checkoutUrl: checkout.short_url || null,
      plannedTrialEndsAt: startAt.toISOString(),
      currentAccessStage: resolvedExisting.stage,
    })
  } catch (error) {
    return buildErrorResponse(error, "Failed to create Razorpay checkout", {
      statusByMessage: {
        Unauthorized: 401,
        "Admin role required": 403,
      },
    })
  }
}
