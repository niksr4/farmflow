import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/server/auth"
import { ensurePrivacySchema, getPrivacyStatus } from "@/lib/server/privacy"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const sessionUser = await requireSessionUser()
    const schema = await ensurePrivacySchema(sessionUser)
    if (!schema.ok) {
      return NextResponse.json({
        success: false,
        error: "DPDP schema missing. Run scripts/40-dpdp-privacy.sql.",
        missing: schema,
      })
    }

    const status = await getPrivacyStatus(sessionUser)
    return NextResponse.json({ success: true, status })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to load privacy status") }, { status: 500 })
  }
}
