import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/server/auth"
import { getMfaStatus } from "@/lib/server/mfa"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const sessionUser = await requireSessionUser()
    const status = await getMfaStatus(sessionUser)
    return NextResponse.json({ success: true, status })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to load MFA status" }, { status: 500 })
  }
}
