import { NextResponse } from "next/server"

import { resolveTenantCommercialAccess } from "@/lib/commercial-access"
import { requireAdminRole } from "@/lib/permissions"
import { getRazorpayPublicConfig } from "@/lib/server/billing/razorpay"
import { requireSessionUser } from "@/lib/server/auth"
import { isDbConfigured, sql } from "@/lib/server/db"
import { resolveScopedSessionUser } from "@/lib/server/module-access"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { loadTenantCommercialAccess } from "@/lib/server/tenant-commercial-access"

export const dynamic = "force-dynamic"

export async function GET() {
  if (!isDbConfigured) {
    return databaseNotConfiguredResponse()
  }

  try {
    const sessionUser = await resolveScopedSessionUser(await requireSessionUser())
    requireAdminRole(sessionUser.role)

    const row = await loadTenantCommercialAccess(sql, sessionUser.tenantId, sessionUser.role)

    return NextResponse.json({
      success: true,
      subscription: row,
      access: resolveTenantCommercialAccess(
        row
          ? {
              billingProvider: row.billing_provider,
              planId: row.plan_id,
              status: row.billing_status,
              trialStartedAt: row.trial_started_at,
              trialEndsAt: row.trial_ends_at,
              currentPeriodEndsAt: row.current_period_ends_at,
              accessEndsAt: row.access_expires_at,
              cancelAtPeriodEnd: row.cancel_at_period_end,
            }
          : null,
      ),
      razorpay: getRazorpayPublicConfig(),
    })
  } catch (error) {
    return buildErrorResponse(error, "Failed to load subscription status", {
      statusByMessage: {
        Unauthorized: 401,
        "Admin role required": 403,
      },
    })
  }
}
