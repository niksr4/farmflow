import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireAdminSession } from "@/lib/server/mfa"

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const adminErrorResponse = (error: any, fallback: string) => {
  const message = error?.message || fallback
  const status = ["MFA required", "Admin role required", "Owner role required", "Unauthorized"].includes(message) ? 403 : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)

    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const limitRaw = Number.parseInt(String(searchParams.get("limit") || "25"), 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25

    const runsResult = await sql.query(
      `
        SELECT id, started_at, completed_at, status, trigger_source, summary
        FROM agent_runs
        WHERE agent_name = 'log-anomaly-agent'
        ORDER BY started_at DESC
        LIMIT $1
      `,
      [limit],
    )
    const runs = Array.isArray(runsResult)
      ? runsResult
      : Array.isArray((runsResult as any)?.rows)
        ? (runsResult as any).rows
        : []

    const latestRunId = runs[0]?.id ? String(runs[0].id) : null
    let findings: any[] = []
    if (latestRunId) {
      const findingsResult = await sql.query(
        `
          SELECT
            tenant_id::text AS tenant_id,
            finding_key,
            severity,
            title,
            description,
            payload,
            created_at
          FROM agent_run_findings
          WHERE run_id = $1::uuid
            AND finding_type = 'log_anomaly_cluster'
          ORDER BY created_at DESC
          LIMIT 50
        `,
        [latestRunId],
      )
      findings = Array.isArray(findingsResult)
        ? findingsResult
        : Array.isArray((findingsResult as any)?.rows)
          ? (findingsResult as any).rows
          : []
    }

    return NextResponse.json({
      success: true,
      runCount: runs.length,
      runs: (runs || []).map((run: any) => ({
        id: String(run.id),
        startedAt: run.started_at ? new Date(run.started_at).toISOString() : null,
        completedAt: run.completed_at ? new Date(run.completed_at).toISOString() : null,
        status: String(run.status),
        triggerSource: String(run.trigger_source || "manual"),
        summary: run.summary && typeof run.summary === "object" ? run.summary : null,
      })),
      latestFindings: (findings || []).map((finding: any) => ({
        tenantId: finding.tenant_id ? String(finding.tenant_id) : null,
        findingKey: String(finding.finding_key),
        severity: String(finding.severity),
        title: String(finding.title),
        description: String(finding.description),
        payload: finding.payload && typeof finding.payload === "object" ? finding.payload : null,
        createdAt: finding.created_at ? new Date(finding.created_at).toISOString() : null,
      })),
    })
  } catch (error: any) {
    if (isMissingRelation(error, "agent_runs") || isMissingRelation(error, "agent_run_findings")) {
      return NextResponse.json(
        { success: false, error: "Agent tables missing. Run scripts/54-agent-ops.sql" },
        { status: 503 },
      )
    }
    console.error("Error fetching log anomaly brief:", error)
    return adminErrorResponse(error, "Failed to fetch log anomaly brief")
  }
}
