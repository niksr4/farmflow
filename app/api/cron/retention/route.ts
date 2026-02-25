import { NextResponse } from "next/server"
import { runRetentionCleanup } from "@/lib/server/privacy"
import { runImportJobRetentionCleanup } from "@/lib/server/import-jobs"

export const dynamic = "force-dynamic"

const getCronSecret = () => {
  const secret = process.env.CRON_SECRET
  return secret ? secret : null
}

async function handleCronInvocation(request: Request) {
  try {
    const secret = getCronSecret()
    if (!secret) {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET is not configured" },
        { status: 503 },
      )
    }

    const authHeader = request.headers.get("authorization") || ""
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await runRetentionCleanup()
    const importJobs = await runImportJobRetentionCleanup()
    return NextResponse.json({ success: true, importJobs })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Retention cleanup failed" },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return handleCronInvocation(request)
}

export async function POST(request: Request) {
  return handleCronInvocation(request)
}
