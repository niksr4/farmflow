import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/server/auth"
import { ensurePrivacySchema, listImpactUsers } from "@/lib/server/privacy"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    if (!start || !end) {
      return NextResponse.json({ success: false, error: "start and end are required" }, { status: 400 })
    }

    const impacted = await listImpactUsers(sessionUser, start, end)
    return NextResponse.json({ success: true, impacted })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to determine impacted users" },
      { status: 500 },
    )
  }
}
