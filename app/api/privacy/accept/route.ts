import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/server/auth"
import { acceptPrivacyNotice, ensurePrivacySchema } from "@/lib/server/privacy"

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
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record privacy notice acceptance" },
      { status: 500 },
    )
  }
}
