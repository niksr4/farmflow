import "server-only"

import { NextResponse } from "next/server"
import { runDataIntegrityAgent } from "@/lib/server/agents/data-integrity-agent"
import { runLogAnomalyAgent } from "@/lib/server/agents/log-anomaly-agent"
import { runRetentionCleanup } from "@/lib/server/privacy"
import { runImportJobRetentionCleanup } from "@/lib/server/import-jobs"
import { runTenantSmokeAgent } from "@/lib/server/agents/tenant-smoke-agent"
import { runTenantEngagementAgent } from "@/lib/server/agents/tenant-engagement-agent"
import { runWeeklyDigestAgent } from "@/lib/server/agents/weekly-digest-agent"
import { runOnboardingNudgeAgent } from "@/lib/server/agents/onboarding-nudge-agent"
import { extractBearerToken, sharedSecretMatches } from "@/lib/server/request-security"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"

const getCronSecret = () => process.env.CRON_SECRET || null

async function handleCronInvocation(request: Request) {
  try {
    const secret = getCronSecret()
    if (!secret) {
      return NextResponse.json({ success: false, error: "CRON_SECRET is not configured" }, { status: 503 })
    }
    if (!sharedSecretMatches(secret, extractBearerToken(request.headers))) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const isMonday = new Date().getDay() === 1

    const [dataIntegrity, logAnomaly, retention, tenantSmoke, tenantEngagement, weeklyDigest, onboardingNudge] =
      await Promise.allSettled([
        runDataIntegrityAgent({ triggerSource: "cron" }),
        runLogAnomalyAgent({ triggerSource: "cron" }),
        runRetentionCleanup().then(() => runImportJobRetentionCleanup()),
        runTenantSmokeAgent({ triggerSource: "cron" }),
        runTenantEngagementAgent({ triggerSource: "cron" }),
        isMonday
          ? runWeeklyDigestAgent({ triggerSource: "cron" })
          : Promise.resolve({ skipped: true }),
        runOnboardingNudgeAgent({ triggerSource: "cron" }),
      ])

    const toResult = (r: PromiseSettledResult<unknown>) =>
      r.status === "fulfilled" ? { ok: true, ...((r.value && typeof r.value === "object") ? r.value : {}) } : { ok: false, error: String((r as PromiseRejectedResult).reason) }

    const results = {
      dataIntegrity: toResult(dataIntegrity),
      logAnomaly: toResult(logAnomaly),
      retention: toResult(retention),
      tenantSmoke: toResult(tenantSmoke),
      tenantEngagement: toResult(tenantEngagement),
      weeklyDigest: toResult(weeklyDigest),
      onboardingNudge: toResult(onboardingNudge),
    }

    const anyFailed = Object.values(results).some((r) => !r.ok)
    return NextResponse.json({ success: true, anyFailed, results })
  } catch (error: any) {
    logServerError("Orchestrator cron invocation failed", error)
    return NextResponse.json({ success: false, error: error?.message || "Orchestrator failed" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handleCronInvocation(request)
}

export async function POST(request: Request) {
  return handleCronInvocation(request)
}
