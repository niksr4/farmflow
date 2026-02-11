import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/server/auth"
import { setupMfa } from "@/lib/server/mfa"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const sessionUser = await requireSessionUser()
    if (!["admin", "owner"].includes(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Admin role required" }, { status: 403 })
    }
    const data = await setupMfa(sessionUser)
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to setup MFA" }, { status: 500 })
  }
}
