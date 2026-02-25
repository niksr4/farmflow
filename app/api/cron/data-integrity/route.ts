import { NextResponse } from "next/server"
import { runDataIntegrityAgent } from "@/lib/server/agents/data-integrity-agent"

export const dynamic = "force-dynamic"

const getCronSecret = () => {
  const secret = process.env.CRON_SECRET
  return secret || null
}

const isAgentTableMissing = (error: unknown) => String((error as Error)?.message || error).includes("scripts/54-agent-ops.sql")

const parseRequestBody = async (request: Request) => {
  if (request.method === "GET") {
    const { searchParams } = new URL(request.url)
    return {
      dryRun: searchParams.get("dryRun") === "1" || searchParams.get("dryRun") === "true",
      tenantId: searchParams.get("tenantId"),
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

    const authHeader = request.headers.get("authorization") || ""
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await parseRequestBody(request)
    const result = await runDataIntegrityAgent({
      triggerSource: "cron",
      dryRun: Boolean(body?.dryRun),
      tenantId: body?.tenantId ? String(body.tenantId) : null,
    })

    return NextResponse.json({ success: true, ...result.summary })
  } catch (error: any) {
    const message = error?.message || "Data integrity agent failed"
    const status = isAgentTableMissing(error) ? 503 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}

export async function GET(request: Request) {
  return handleCronInvocation(request)
}

export async function POST(request: Request) {
  return handleCronInvocation(request)
}
