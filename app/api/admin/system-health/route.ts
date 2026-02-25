import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireAdminSession } from "@/lib/server/mfa"

type HealthStatus = "healthy" | "warning" | "critical" | "unknown"

type HealthCheck = {
  id: string
  label: string
  status: HealthStatus
  value: string
  detail: string
  actionPath?: string
}

const STALE_THRESHOLD_HOURS = 36

const asRows = (result: unknown): any[] => {
  if (Array.isArray(result)) return result
  if (Array.isArray((result as any)?.rows)) return (result as any).rows
  return []
}

const toIsoOrNull = (value: unknown) => {
  if (!value) return null
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const buildAgentCheck = (agentName: string, run: any, actionPath: string): HealthCheck => {
  if (!run) {
    return {
      id: agentName,
      label: agentName,
      status: "unknown",
      value: "No runs found",
      detail: "Run the cron once to establish baseline health.",
      actionPath,
    }
  }

  const status = String(run.status || "unknown")
  const startedAt = run.started_at ? new Date(run.started_at) : null
  const ageHours = startedAt ? (Date.now() - startedAt.getTime()) / (60 * 60 * 1000) : null

  if (status === "failed") {
    return {
      id: agentName,
      label: agentName,
      status: "critical",
      value: "Last run failed",
      detail: startedAt ? `Failed at ${startedAt.toISOString()}.` : "Last run failed.",
      actionPath,
    }
  }

  if (ageHours !== null && ageHours > STALE_THRESHOLD_HOURS) {
    return {
      id: agentName,
      label: agentName,
      status: "warning",
      value: "Run is stale",
      detail: startedAt ? `Last run started at ${startedAt.toISOString()}.` : "No recent run timestamp.",
      actionPath,
    }
  }

  return {
    id: agentName,
    label: agentName,
    status: "healthy",
    value: "Healthy",
    detail: startedAt ? `Last run started at ${startedAt.toISOString()}.` : "Agent is healthy.",
    actionPath,
  }
}

export async function GET() {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)

    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const checks: HealthCheck[] = []
    const nowIso = new Date().toISOString()

    let latestDataIntegrityRun: any = null
    let latestLogAnomalyRun: any = null
    let openExceptions = 0
    let highSeverityExceptions = 0
    let failedImportsLast24h = 0
    let activeValidatedImports = 0
    let criticalErrorsLast24h = 0
    let errorEventsLast24h = 0

    try {
      const dataIntegrityRows = asRows(
        await sql.query(
          `
            SELECT id, status, started_at, completed_at, summary
            FROM agent_runs
            WHERE agent_name = $1
            ORDER BY started_at DESC
            LIMIT 1
          `,
          ["data-integrity-agent"],
        ),
      )
      latestDataIntegrityRun = dataIntegrityRows[0] || null

      const logAnomalyRows = asRows(
        await sql.query(
          `
            SELECT id, status, started_at, completed_at, summary
            FROM agent_runs
            WHERE agent_name = $1
            ORDER BY started_at DESC
            LIMIT 1
          `,
          ["log-anomaly-agent"],
        ),
      )
      latestLogAnomalyRun = logAnomalyRows[0] || null
    } catch (error) {
      if (!isMissingRelation(error, "agent_runs")) throw error
    }

    checks.push(buildAgentCheck("Data integrity agent", latestDataIntegrityRun, "/api/admin/data-integrity-exceptions"))
    checks.push(buildAgentCheck("Log anomaly agent", latestLogAnomalyRun, "/api/admin/log-anomaly-brief"))

    try {
      const exceptionRows = asRows(
        await sql.query(
          `
            SELECT
              COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
              COUNT(*) FILTER (WHERE status = 'open' AND severity IN ('high', 'critical'))::int AS high_count,
              MAX(last_seen_at) FILTER (WHERE status = 'open') AS last_seen_at
            FROM data_integrity_exceptions
          `,
          [],
        ),
      )
      openExceptions = Number(exceptionRows[0]?.open_count) || 0
      highSeverityExceptions = Number(exceptionRows[0]?.high_count) || 0
      const lastSeenAt = exceptionRows[0]?.last_seen_at ? new Date(exceptionRows[0].last_seen_at).toISOString() : null
      checks.push({
        id: "data-integrity-open",
        label: "Open integrity exceptions",
        status: highSeverityExceptions > 0 ? "critical" : openExceptions > 0 ? "warning" : "healthy",
        value: String(openExceptions),
        detail: lastSeenAt ? `Last seen: ${lastSeenAt}` : "No open exceptions.",
        actionPath: "/api/admin/data-integrity-exceptions?status=open&limit=200",
      })
    } catch (error) {
      if (!isMissingRelation(error, "data_integrity_exceptions")) throw error
      checks.push({
        id: "data-integrity-open",
        label: "Open integrity exceptions",
        status: "unknown",
        value: "Unavailable",
        detail: "Run scripts/54-agent-ops.sql to enable this health check.",
      })
    }

    try {
      const importRows = asRows(
        await sql.query(
          `
            SELECT
              COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '24 hours')::int AS failed_last_24h,
              COUNT(*) FILTER (
                WHERE mode = 'validate'
                  AND status = 'validated'
                  AND validation_expires_at IS NOT NULL
                  AND validation_expires_at >= NOW()
              )::int AS active_validated
            FROM import_jobs
          `,
          [],
        ),
      )
      failedImportsLast24h = Number(importRows[0]?.failed_last_24h) || 0
      activeValidatedImports = Number(importRows[0]?.active_validated) || 0
      checks.push({
        id: "import-jobs",
        label: "Import pipeline",
        status: failedImportsLast24h > 0 ? "warning" : "healthy",
        value: `${failedImportsLast24h} failed / 24h`,
        detail: `${activeValidatedImports} validated imports waiting for commit.`,
      })
    } catch (error) {
      if (!isMissingRelation(error, "import_jobs")) throw error
      checks.push({
        id: "import-jobs",
        label: "Import pipeline",
        status: "unknown",
        value: "Unavailable",
        detail: "Run scripts/56-import-jobs.sql to enable this health check.",
      })
    }

    try {
      const errorRows = asRows(
        await sql.query(
          `
            SELECT
              COUNT(*) FILTER (WHERE severity = 'critical' AND created_at >= NOW() - INTERVAL '24 hours')::int AS critical_last_24h,
              COUNT(*) FILTER (WHERE severity IN ('error', 'critical') AND created_at >= NOW() - INTERVAL '24 hours')::int AS errors_last_24h,
              MAX(created_at) FILTER (WHERE severity = 'critical') AS last_critical_at
            FROM app_error_events
          `,
          [],
        ),
      )
      criticalErrorsLast24h = Number(errorRows[0]?.critical_last_24h) || 0
      errorEventsLast24h = Number(errorRows[0]?.errors_last_24h) || 0
      const lastCriticalAt = errorRows[0]?.last_critical_at ? new Date(errorRows[0].last_critical_at).toISOString() : null
      checks.push({
        id: "app-errors",
        label: "App errors",
        status: criticalErrorsLast24h > 0 ? "critical" : errorEventsLast24h > 0 ? "warning" : "healthy",
        value: `${errorEventsLast24h} error events / 24h`,
        detail: lastCriticalAt ? `Last critical event: ${lastCriticalAt}` : "No critical events reported.",
      })
    } catch (error) {
      if (!isMissingRelation(error, "app_error_events")) throw error
      checks.push({
        id: "app-errors",
        label: "App errors",
        status: "unknown",
        value: "Unavailable",
        detail: "Run scripts/54-agent-ops.sql to enable this health check.",
      })
    }

    return NextResponse.json({
      success: true,
      generatedAt: nowIso,
      checks,
      metrics: {
        openExceptions,
        highSeverityExceptions,
        failedImportsLast24h,
        activeValidatedImports,
        criticalErrorsLast24h,
        errorEventsLast24h,
      },
      latestRuns: {
        dataIntegrity: latestDataIntegrityRun
          ? {
              id: String(latestDataIntegrityRun.id),
              status: String(latestDataIntegrityRun.status),
              startedAt: toIsoOrNull(latestDataIntegrityRun.started_at),
              completedAt: toIsoOrNull(latestDataIntegrityRun.completed_at),
              summary:
                latestDataIntegrityRun.summary && typeof latestDataIntegrityRun.summary === "object"
                  ? latestDataIntegrityRun.summary
                  : null,
            }
          : null,
        logAnomaly: latestLogAnomalyRun
          ? {
              id: String(latestLogAnomalyRun.id),
              status: String(latestLogAnomalyRun.status),
              startedAt: toIsoOrNull(latestLogAnomalyRun.started_at),
              completedAt: toIsoOrNull(latestLogAnomalyRun.completed_at),
              summary:
                latestLogAnomalyRun.summary && typeof latestLogAnomalyRun.summary === "object"
                  ? latestLogAnomalyRun.summary
                  : null,
            }
          : null,
      },
      staleThresholdHours: STALE_THRESHOLD_HOURS,
    })
  } catch (error: any) {
    const message = error?.message || "Failed to load system health"
    const status = ["MFA required", "Admin role required", "Owner role required", "Unauthorized"].includes(message) ? 403 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
