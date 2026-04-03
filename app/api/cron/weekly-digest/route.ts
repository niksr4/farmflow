import { NextResponse } from "next/server"
import { runWeeklyDigestAgent } from "@/lib/server/agents/weekly-digest-agent"
import { extractBearerToken, sharedSecretMatches } from "@/lib/server/request-security"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const getCronSecret = () => process.env.CRON_SECRET || null

const parseRequestBody = async (request: Request) => {
  if (request.method === "GET") {
    const { searchParams } = new URL(request.url)
    return {
      dryRun: searchParams.get("dryRun") === "1" || searchParams.get("dryRun") === "true",
      tenantId: searchParams.get("tenantId") || undefined,
    }
  }
  return await request.json().catch(() => ({}))
}

async function handleCronInvocation(request: Request) {
  try {
    const secret = getCronSecret()
    if (!secret) {
      return NextResponse.json({ success: false, error: "CRON_SECRET is not configured" }, { status: 503 })
    }

    if (!sharedSecretMatches(secret, extractBearerToken(request.headers))) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await parseRequestBody(request)
    const result = await runWeeklyDigestAgent({
      triggerSource: "cron",
      dryRun: Boolean(body?.dryRun),
      tenantId: typeof body?.tenantId === "string" ? body.tenantId : undefined,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    logServerError("Weekly digest cron invocation failed", error)
    return NextResponse.json({ success: false, error: error?.message || "Weekly digest agent failed" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handleCronInvocation(request)
}

export async function POST(request: Request) {
  return handleCronInvocation(request)
}
