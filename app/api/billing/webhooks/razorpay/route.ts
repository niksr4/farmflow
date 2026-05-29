import { NextResponse } from "next/server"

import { extractClientIp } from "@/lib/server/request-security"
import {
  razorpayStatusToCommercialStatus,
  unixSecondsToIso,
  verifyRazorpayWebhookSignature,
} from "@/lib/server/billing/razorpay"
import { logAppErrorEvent } from "@/lib/server/error-events"
import { logProductIntelligenceEvent } from "@/lib/server/product-intelligence-events"
import { logSecurityEvent } from "@/lib/server/security-events"
import { isDbConfigured, sql } from "@/lib/server/db"
import {
  findTenantByBillingSubscriptionId,
  loadTenantCommercialAccess,
  saveTenantCommercialAccess,
} from "@/lib/server/tenant-commercial-access"
import { persistTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export const dynamic = "force-dynamic"

const ownerContext = normalizeTenantContext(undefined, "owner")
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const normalizeTenantId = (value: unknown) => {
  const normalized = String(value || "").trim()
  return UUID_PATTERN.test(normalized) ? normalized : ""
}

const insertWebhookEvent = async (eventId: string, eventType: string, payload: unknown) => {
  const rows = await runTenantQuery(
    sql,
    ownerContext,
    sql`
      INSERT INTO billing_webhook_events (
        provider,
        external_event_id,
        event_type,
        status,
        payload
      )
      VALUES (
        'razorpay',
        ${eventId},
        ${eventType},
        'received',
        ${JSON.stringify(payload || {})}::jsonb
      )
      ON CONFLICT (provider, external_event_id) DO NOTHING
      RETURNING id
    `,
  )
  return String(rows?.[0]?.id || "")
}

const finalizeWebhookEvent = async (id: string, status: "processed" | "ignored" | "failed", errorMessage?: string | null) => {
  if (!id) return
  await runTenantQuery(
    sql,
    ownerContext,
    sql`
      UPDATE billing_webhook_events
      SET status = ${status},
          processed_at = CURRENT_TIMESTAMP,
          error_message = ${errorMessage || null}
      WHERE id = ${id}
    `,
  )
}

export async function POST(request: Request) {
  if (!isDbConfigured) {
    return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
  }

  const rawBody = await request.text()
  const signature = String(request.headers.get("x-razorpay-signature") || "").trim()
  const webhookSecret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim()
  const eventIdHeader = String(request.headers.get("x-razorpay-event-id") || "").trim()

  if (!verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ success: false, error: "Invalid webhook signature" }, { status: 401 })
  }

  let eventRecordId = ""

  try {
    const payload = JSON.parse(rawBody)
    const eventType = String(payload?.event || "").trim() || "unknown"
    const subscription = payload?.payload?.subscription?.entity
    const subscriptionId = String(subscription?.id || "").trim()
    const eventId = eventIdHeader || `${eventType}:${subscriptionId || "none"}:${String(payload?.created_at || "")}`

    eventRecordId = await insertWebhookEvent(eventId, eventType, payload)
    if (!eventRecordId) {
      return NextResponse.json({ success: true, duplicate: true })
    }

    if (!subscriptionId) {
      await finalizeWebhookEvent(eventRecordId, "ignored", "Subscription entity missing")
      return NextResponse.json({ success: true, ignored: true })
    }

    const tenantIdFromNotes = normalizeTenantId(subscription?.notes?.tenant_id || subscription?.notes?.tenantId)
    const existingBySubscription = await findTenantByBillingSubscriptionId(sql, subscriptionId)
    const tenantId = tenantIdFromNotes || existingBySubscription?.tenantId || ""

    if (!tenantId) {
      await finalizeWebhookEvent(eventRecordId, "ignored", "Tenant lookup failed")
      return NextResponse.json({ success: true, ignored: true })
    }

    const current = existingBySubscription?.row || (await loadTenantCommercialAccess(sql, tenantId, "owner"))
    const providerMetadata =
      current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata
        : {}

    const nextStatus = razorpayStatusToCommercialStatus(subscription?.status, {
      startAt: Number(subscription?.start_at || 0) || null,
    })
    const webhookCreatedAt = unixSecondsToIso(Number(payload?.created_at || 0) || null) || new Date().toISOString()
    const planIdFromNotes = String(subscription?.notes?.tenant_plan_id || subscription?.notes?.tenantPlanId || "").trim()
    const plannedTrialEndsAt = unixSecondsToIso(Number(subscription?.start_at || 0) || null)

    await saveTenantCommercialAccess(sql, tenantId, "owner", {
      planId: planIdFromNotes || current?.plan_id,
      billingProvider: "razorpay",
      status: nextStatus,
      billingCustomerId: String(subscription?.customer_id || "").trim() || null,
      billingSubscriptionId: subscriptionId,
      billingPriceId: String(subscription?.plan_id || "").trim() || null,
      trialStartedAt: nextStatus === "trialing" ? current?.trial_started_at || webhookCreatedAt : current?.trial_started_at ?? null,
      trialEndsAt: nextStatus === "trialing" ? plannedTrialEndsAt : current?.trial_ends_at ?? null,
      currentPeriodStartedAt: unixSecondsToIso(Number(subscription?.current_start || 0) || null),
      currentPeriodEndsAt: unixSecondsToIso(Number(subscription?.current_end || 0) || null),
      accessExpiresAt:
        unixSecondsToIso(Number(subscription?.current_end || 0) || null) ||
        unixSecondsToIso(Number(subscription?.end_at || 0) || null) ||
        (nextStatus === "trialing" ? plannedTrialEndsAt : null),
      cancelAtPeriodEnd: nextStatus === "canceled",
      canceledAt: unixSecondsToIso(Number(subscription?.ended_at || 0) || null),
      lastSyncedAt: webhookCreatedAt,
      metadata: {
        ...providerMetadata,
        razorpay: {
          ...(providerMetadata.razorpay && typeof providerMetadata.razorpay === "object" ? (providerMetadata.razorpay as object) : {}),
          checkoutMode: "hosted_subscription_link",
          lastWebhookEvent: eventType,
          lastWebhookEventId: eventId,
          lastWebhookAt: webhookCreatedAt,
          providerPlanId: String(subscription?.plan_id || "").trim() || null,
        },
      },
    })

    if (planIdFromNotes) {
      await persistTenantPlanId(sql, tenantId, "owner", planIdFromNotes)
    }

    await logSecurityEvent({
      tenantId,
      actorRole: "owner",
      eventType: "billing_webhook_processed",
      severity: "info",
      source: "billing/webhooks/razorpay",
      ipAddress: extractClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      metadata: {
        provider: "razorpay",
        webhookEvent: eventType,
        subscriptionId,
        commercialStatus: nextStatus,
      },
    })

    await logProductIntelligenceEvent({
      tenantId,
      actorRole: "owner",
      eventType: "billing_webhook_processed",
      moduleId: "billing",
      source: "billing/webhooks/razorpay",
      metadata: {
        provider: "razorpay",
        webhookEvent: eventType,
        subscriptionId,
        commercialStatus: nextStatus,
      },
    })

    await finalizeWebhookEvent(eventRecordId, "processed")
    return NextResponse.json({ success: true, processed: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Razorpay webhook failed")
    await finalizeWebhookEvent(eventRecordId, "failed", message).catch(() => undefined)
    await logAppErrorEvent({
      source: "billing/webhooks/razorpay",
      endpoint: "/api/billing/webhooks/razorpay",
      errorCode: "razorpay_webhook_failed",
      severity: "error",
      message,
      metadata: {
        eventRecordId: eventRecordId || null,
      },
    }).catch(() => undefined)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
