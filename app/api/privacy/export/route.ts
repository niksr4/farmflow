import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/server/auth"
import { ensurePrivacySchema, exportPersonalData } from "@/lib/server/privacy"

export const dynamic = "force-dynamic"

export async function GET() {
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

    const payload = await exportPersonalData(sessionUser)
    return NextResponse.json({ success: true, payload })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to export data" }, { status: 500 })
  }
}
