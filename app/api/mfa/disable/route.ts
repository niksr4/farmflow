import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/server/auth"
import { disableMfa } from "@/lib/server/mfa"
import { getPostHogClient } from "@/lib/posthog-server"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser()
    if (!["admin", "owner"].includes(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Admin role required" }, { status: 403 })
    }
    const body = await request.json()
    const token = String(body?.token || "").trim()
    if (!token) {
      return NextResponse.json({ success: false, error: "MFA code required" }, { status: 400 })
    }
    await disableMfa(sessionUser, token)
    const posthog = getPostHogClient()
    if (posthog) {
      const tenantId = sessionUser.tenantId || "global"
      const distinctId = `${tenantId}:${sessionUser.username}`
      posthog.capture({
        distinctId,
        event: "mfa_disabled",
        properties: {
          username: sessionUser.username,
          role: sessionUser.role,
          tenant_id: tenantId,
        },
      })
    }
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to disable MFA" }, { status: 500 })
  }
}
