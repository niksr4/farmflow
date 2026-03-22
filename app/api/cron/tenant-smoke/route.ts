import { NextResponse } from "next/server"
import { runTenantSmokeAgent } from "@/lib/server/agents/tenant-smoke-agent"
import { extractBearerToken, sharedSecretMatches } from "@/lib/server/request-security"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"

const getCronSecret = () => {
  const secret = process.env.CRON_SECRET
  return secret || null
}

const isAgentTableMissing = (error: unknown) => String((error as Error)?.message || error).includes("scripts/54-agent-ops.sql")
const isSmokeConfigMissing = (error: unknown) => {
  const message = String((error as Error)?.message || error)
  return (
    message.includes("TENANT_SMOKE_TARGETS_JSON is not configured") ||
    message.includes("TENANT_SMOKE_BASE_URL or NEXT_PUBLIC_APP_URL/NEXTAUTH_URL must be configured")
  )
}

const parseRequestBody = async (request: Request) => {
  if (request.method === "GET") {
    const { searchParams } = new URL(request.url)
    return {
      dryRun: searchParams.get("dryRun") === "1" || searchParams.get("dryRun") === "true",
      tenantSlug: searchParams.get("tenantSlug") || searchParams.get("slug"),
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
    const result = await runTenantSmokeAgent({
      triggerSource: "cron",
      dryRun: Boolean(body?.dryRun),
      tenantSlug: body?.tenantSlug ? String(body.tenantSlug) : null,
    })

    return NextResponse.json({ success: true, ...result.summary })
  } catch (error: any) {
    if (isSmokeConfigMissing(error)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: error?.message || "Tenant smoke monitor is not configured",
      })
    }
    logServerError("Tenant smoke cron invocation failed", error)
    const message = error?.message || "Tenant smoke agent failed"
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
