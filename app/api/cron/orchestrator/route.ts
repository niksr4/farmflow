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
import { sql } from "@/lib/server/db"
import { extractBearerToken, sharedSecretMatches } from "@/lib/server/request-security"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const getCronSecret = () => process.env.CRON_SECRET || null

// Pings a Healthchecks.io check URL so missed/failed cron runs trigger an alert.
// Set HEALTHCHECKS_PING_URL to the check's ping URL in Vercel env vars.
// Append /fail for failure pings (Healthchecks.io convention).
async function pingHealthcheck(outcome: "success" | "fail"): Promise<void> {
  const baseUrl = String(process.env.HEALTHCHECKS_PING_URL || "").trim()
  if (!baseUrl) return
  const url = outcome === "fail" ? `${baseUrl}/fail` : baseUrl
  try {
    await fetch(url, { method: "HEAD" })
  } catch {
    // Non-fatal — don't let a monitoring failure break the cron response
  }
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

    const isMonday = new Date().getDay() === 1

    // Guard: skip weekly digest if a successful run already completed this calendar week.
    // Prevents double-sends on Vercel cron retries or manual re-triggers on Monday.
    let digestAlreadySentThisWeek = false
    if (isMonday && sql) {
      try {
        const guard = await sql`
          SELECT id FROM agent_runs
          WHERE agent_name = 'weekly-digest'
            AND status = 'success'
            AND completed_at >= date_trunc('week', NOW())
          LIMIT 1
        `
        const rows = Array.isArray(guard) ? guard : (guard as any)?.rows ?? []
        digestAlreadySentThisWeek = rows.length > 0
      } catch { /* non-critical — allow digest to run if guard fails */ }
    }

    const [dataIntegrity, logAnomaly, retention, tenantSmoke, tenantEngagement, weeklyDigest, onboardingNudge] =
      await Promise.allSettled([
        runDataIntegrityAgent({ triggerSource: "cron" }),
        runLogAnomalyAgent({ triggerSource: "cron" }),
        runRetentionCleanup().then(() => runImportJobRetentionCleanup()),
        runTenantSmokeAgent({ triggerSource: "cron" }),
        runTenantEngagementAgent({ triggerSource: "cron" }),
        isMonday && !digestAlreadySentThisWeek
          ? runWeeklyDigestAgent({ triggerSource: "cron" })
          : Promise.resolve({ skipped: true, reason: isMonday ? "already-sent-this-week" : "not-monday" }),
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
    await pingHealthcheck(anyFailed ? "fail" : "success")
    return NextResponse.json({ success: true, anyFailed, results })
  } catch (error: any) {
    logServerError("Orchestrator cron invocation failed", error)
    await pingHealthcheck("fail")
    return NextResponse.json({ success: false, error: error?.message || "Orchestrator failed" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handleCronInvocation(request)
}

export async function POST(request: Request) {
  return handleCronInvocation(request)
}
