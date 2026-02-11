import { NextResponse } from "next/server"
import { runRetentionCleanup } from "@/lib/server/privacy"

export const dynamic = "force-dynamic"

const requireCronSecret = () => {
  const secret = process.env.CRON_SECRET
  return secret ? secret : null
}

export async function POST(request: Request) {
  try {
    const secret = requireCronSecret()
    if (secret) {
      const authHeader = request.headers.get("authorization") || ""
      if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
      }
    }

    await runRetentionCleanup()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Retention cleanup failed" },
      { status: 500 },
    )
  }
}
