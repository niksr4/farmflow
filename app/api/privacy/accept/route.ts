import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/server/auth"
import { acceptPrivacyNotice, ensurePrivacySchema } from "@/lib/server/privacy"
import { getPostHogClient } from "@/lib/posthog-server"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const sessionUser = await requireSessionUser()
    const schema = await ensurePrivacySchema(sessionUser)
    if (!schema.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "DPDP schema missing. Run scripts/40-dpdp-privacy.sql.",
          missing: schema,
        },
        { status: 500 },
      )
    }

    await acceptPrivacyNotice(sessionUser)
    const posthog = getPostHogClient()
    if (posthog) {
      const tenantId = sessionUser.tenantId || "global"
      const distinctId = `${tenantId}:${sessionUser.username}`
      posthog.capture({
        distinctId,
        event: "privacy_notice_accepted",
        properties: {
          username: sessionUser.username,
          role: sessionUser.role,
          tenant_id: tenantId,
        },
      })
    }
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record privacy notice acceptance" },
      { status: 500 },
    )
  }
}
