import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/server/auth"
import { ensurePrivacySchema, updateMarketingConsent } from "@/lib/server/privacy"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
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

    const body = await request.json()
    const consent = Boolean(body?.consent)
    await updateMarketingConsent(sessionUser, consent)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update consent preference" },
      { status: 500 },
    )
  }
}
