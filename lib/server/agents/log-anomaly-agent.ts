import "server-only"

import { generateObject } from "ai"
import { z } from "zod"
// This agent runs from cron across every tenant, not inside a per-request handler, so it uses
// the RLS-bypassing owner connection rather than app_runtime, which requires a per-request
// app.tenant_id session context this code never has.
import { adminSql as sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { resolveAgentModel } from "@/lib/server/agents/ai-model"
import { buildErrorFingerprint, DAY_MS, normalizeMessage } from "@/lib/server/agents/utils"
import { finishAgentRun, saveAgentFinding, startAgentRun } from "@/lib/server/agents/agent-store"
import { sendAgentAlertEmail } from "@/lib/server/agents/alert-email"

type AnomalySeverity = "low" | "medium" | "high" | "critical"

type RawEvent = {
  occurredAt: string
  tenantId: string | null
  source: string
  code: string
  endpoint: string | null
  message: string
  severity: AnomalySeverity
  fingerprint: string
}

type EventCluster = {
  fingerprint: string
  severity: AnomalySeverity
  source: string
  code: string
  message: string
  endpoints: string[]
  tenants: string[]
  currentCount: number
  priorCount: number
  totalCount: number
  isNewSinceYesterday: boolean
  likelyCause: string
  impactedEndpointCount: number
  latestOccurrence: string
}

const BriefSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  likelyCauses: z.array(z.string()).max(6),
  actions: z
    .array(
      z.object({
        priority: z.enum(["high", "medium", "low"]),
        step: z.string(),
      }),
    )
    .max(8),
})

const severityOrder: Record<AnomalySeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const truncate = (value: string, max = 220) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const toRows = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  const candidate = (value as any)?.rows
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

const toAnomalySeverity = (value: unknown): AnomalySeverity => {
  const normalized = String(value || "").toLowerCase()
  if (normalized === "critical") return "critical"
  if (normalized === "high") return "high"
  if (normalized === "medium" || normalized === "warning" || normalized === "error") return "medium"
  return "low"
}

const isTestSource = (source: string) => {
  const normalized = String(source || "").trim().toLowerCase()
  return (
    normalized === "smoke" ||
    normalized.startsWith("smoke/") ||
    normalized.startsWith("test/") ||
    normalized.startsWith("e2e/")
  )
}

const isOperationalPermissionChange = (cluster: Pick<EventCluster, "source" | "code">) => {
  const source = String(cluster.source || "").trim().toLowerCase()
  const code = String(cluster.code || "").trim().toLowerCase()
  return code === "permission_change" && source.startsWith("admin/")
}

/**
 * Events emitted when a user recovers their own account. Not faults — this is the auth system
 * working as designed.
 */
const AUTH_RECOVERY_CODES = new Set([
  "auth_login_failure",
  "auth_password_reset_requested",
  "auth_password_reset_completed",
  "auth_email_change_requested",
  "auth_email_change_completed",
])

/**
 * A handful of these is one person who forgot a password; a flood is credential stuffing.
 * Volume is the only discriminator available here, and deliberately so: auth_login_failure
 * carries NO tenant_id (the login failed, so no tenant ever resolved — verified against
 * production, 0 of 5 rows over three days), which rules out tenant-spread as a signal.
 *
 * Sized against a 6-tenant, 11-user install where a confused admin generated 4 failures across
 * two sittings. An actual attack on an install this size produces far more than this and still
 * alerts.
 */
const ROUTINE_AUTH_RECOVERY_MAX_EVENTS = 12

export const isRoutineAuthRecovery = (cluster: Pick<EventCluster, "code" | "currentCount" | "severity">) => {
  if (!AUTH_RECOVERY_CODES.has(String(cluster.code || "").trim().toLowerCase())) return false
  if (cluster.severity === "critical" || cluster.severity === "high") return false
  return cluster.currentCount <= ROUTINE_AUTH_RECOVERY_MAX_EVENTS
}

/**
 * Known-benign clusters: still recorded and still counted, just not worth waking anyone for.
 *
 * The cost of getting this wrong in the lenient direction is alert fatigue, and that is not a
 * cosmetic problem here — a routine password reset and the opening phase of a credential
 * stuffing run produce the same event codes. If the routine case pages every time, the alert
 * stops being read, and the real one arrives looking exactly like the noise that has been
 * ignored for weeks.
 */
export const isKnownBenignCluster = (
  cluster: Pick<EventCluster, "source" | "code" | "currentCount" | "severity">,
) => isOperationalPermissionChange(cluster) || isRoutineAuthRecovery(cluster)

export const inferLikelyCause = (cluster: {
  code: string
  message: string
  endpoint: string
  source: string
  severity: AnomalySeverity
}) => {
  const text = `${cluster.code} ${cluster.message} ${cluster.endpoint} ${cluster.source}`.toLowerCase()
  // Checked before the keyword cascade: these codes match none of the branches below and were
  // falling through to the catch-all, which told the reader a forgotten password was "likely an
  // application logic regression". It is not a regression, it is not unhandled input, and saying
  // so sends whoever reads the alert looking for a bug that does not exist.
  if (AUTH_RECOVERY_CODES.has(String(cluster.code || "").trim().toLowerCase())) {
    return "Account recovery activity (failed sign-in, password reset or email change). Normal at low volume; investigate as credential stuffing only if the count is high or spread across many accounts."
  }
  if (text.includes("does not exist") || text.includes("42p01")) {
    return "Likely missing migration or schema drift between environments."
  }
  if (text.includes("permission") || text.includes("unauthorized") || text.includes("forbidden") || text.includes("mfa")) {
    return "Likely access control or authentication policy mismatch."
  }
  if (
    text.includes("timeout") ||
    text.includes("fetch failed") ||
    text.includes("econn") ||
    text.includes("connect") ||
    text.includes("network")
  ) {
    return "Likely dependency/network instability (database or API connectivity)."
  }
  if (text.includes("duplicate") || text.includes("23505")) {
    return "Likely duplicate write path or missing idempotency guard."
  }
  if (text.includes("invalid") || text.includes("validation") || text.includes("zod") || text.includes("22p02")) {
    return "Likely malformed payloads or stricter input validation than caller expects."
  }
  if (cluster.severity === "critical") {
    return "Critical error cluster; inspect stack traces and recent deploy changes for this endpoint."
  }
  return "Likely application logic regression or edge-case input not handled cleanly."
}

async function fetchAnomalyEvents(startDateIso: string) {
  if (!sql) throw new Error("Database not configured")
  const tenantContext = normalizeTenantContext(undefined, "owner")
  const rows: RawEvent[] = []

  try {
    const appRowsResult = await sql.query(
      `
        SELECT
          created_at,
          tenant_id::text AS tenant_id,
          source,
          COALESCE(error_code, 'app_error') AS code,
          endpoint,
          message,
          severity,
          COALESCE(fingerprint, '') AS fingerprint
        FROM app_error_events
        WHERE created_at >= $1::timestamptz
          AND (tenant_id IS NULL OR tenant_id NOT IN (
            SELECT id FROM tenants WHERE LOWER(name) LIKE 'e2e %'
          ))
      `,
      [startDateIso],
    )

    const appRows = toRows<any>(appRowsResult)
    appRows.forEach((row: any) => {
      const endpoint = row.endpoint ? String(row.endpoint) : null
      const source = String(row.source || "app")
      if (isTestSource(source)) return
      const code = String(row.code || "app_error")
      const message = String(row.message || "")
      const fingerprint =
        String(row.fingerprint || "").trim() ||
        buildErrorFingerprint({ source, code, endpoint, message: normalizeMessage(message) })

      rows.push({
        occurredAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        tenantId: row.tenant_id ? String(row.tenant_id) : null,
        source,
        code,
        endpoint,
        message,
        severity: toAnomalySeverity(row.severity),
        fingerprint,
      })
    })
  } catch (error) {
    if (!isMissingRelation(error, "app_error_events")) throw error
  }

  try {
    const securityRowsResult = await runTenantQuery(
      sql,
      tenantContext,
      sql.query(
        `
          SELECT
            created_at,
            tenant_id::text AS tenant_id,
            COALESCE(source, 'security') AS source,
            event_type AS code,
            COALESCE(metadata->>'endpoint', metadata->>'path', null) AS endpoint,
            COALESCE(metadata->>'message', event_type) AS message,
            severity
          FROM security_events
          WHERE created_at >= $1::timestamptz
            AND severity IN ('warning', 'critical')
            AND (tenant_id IS NULL OR tenant_id NOT IN (
              SELECT id FROM tenants WHERE LOWER(name) LIKE 'e2e %'
            ))
        `,
        [startDateIso],
      ),
    )

    const securityRows = toRows<any>(securityRowsResult)
    securityRows.forEach((row: any) => {
      const endpoint = row.endpoint ? String(row.endpoint) : null
      const source = String(row.source || "security")
      const code = String(row.code || "security_event")
      const message = String(row.message || row.code || "")
      const fingerprint = buildErrorFingerprint({ source, code, endpoint, message: normalizeMessage(message) })
      rows.push({
        occurredAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        tenantId: row.tenant_id ? String(row.tenant_id) : null,
        source,
        code,
        endpoint,
        message,
        severity: toAnomalySeverity(row.severity),
        fingerprint,
      })
    })
  } catch (error) {
    if (!isMissingRelation(error, "security_events")) throw error
  }

  return rows
}

function buildClusters(events: RawEvent[]) {
  const now = Date.now()
  const currentStartMs = now - DAY_MS

  const clusterMap = new Map<
    string,
    {
      severity: AnomalySeverity
      source: string
      code: string
      message: string
      endpoints: Set<string>
      tenants: Set<string>
      currentCount: number
      priorCount: number
      totalCount: number
      latestOccurrence: string
    }
  >()

  for (const event of events) {
    const eventTime = new Date(event.occurredAt).getTime()
    const bucket = eventTime >= currentStartMs ? "current" : "prior"
    const existing = clusterMap.get(event.fingerprint) || {
      severity: event.severity,
      source: event.source,
      code: event.code,
      message: event.message,
      endpoints: new Set<string>(),
      tenants: new Set<string>(),
      currentCount: 0,
      priorCount: 0,
      totalCount: 0,
      latestOccurrence: event.occurredAt,
    }

    if (severityOrder[event.severity] > severityOrder[existing.severity]) {
      existing.severity = event.severity
    }
    existing.totalCount += 1
    if (bucket === "current") existing.currentCount += 1
    if (bucket === "prior") existing.priorCount += 1
    if (event.endpoint) existing.endpoints.add(event.endpoint)
    if (event.tenantId) existing.tenants.add(event.tenantId)
    if (event.occurredAt > existing.latestOccurrence) {
      existing.latestOccurrence = event.occurredAt
    }

    clusterMap.set(event.fingerprint, existing)
  }

  const clusters: EventCluster[] = Array.from(clusterMap.entries())
    .map(([fingerprint, cluster]) => {
      const primaryEndpoint = Array.from(cluster.endpoints)[0] || "unknown"
      return {
        fingerprint,
        severity: cluster.severity,
        source: cluster.source,
        code: cluster.code,
        message: cluster.message,
        endpoints: Array.from(cluster.endpoints),
        tenants: Array.from(cluster.tenants),
        currentCount: cluster.currentCount,
        priorCount: cluster.priorCount,
        totalCount: cluster.totalCount,
        isNewSinceYesterday: cluster.currentCount > 0 && cluster.priorCount === 0,
        likelyCause: inferLikelyCause({
          code: cluster.code,
          message: cluster.message,
          endpoint: primaryEndpoint,
          source: cluster.source,
          severity: cluster.severity,
        }),
        impactedEndpointCount: cluster.endpoints.size,
        latestOccurrence: cluster.latestOccurrence,
      }
    })
    .filter((cluster) => cluster.currentCount > 0)
    .sort((a, b) => {
      const severityDelta = severityOrder[b.severity] - severityOrder[a.severity]
      if (severityDelta !== 0) return severityDelta
      const newDelta = Number(b.isNewSinceYesterday) - Number(a.isNewSinceYesterday)
      if (newDelta !== 0) return newDelta
      return b.currentCount - a.currentCount
    })

  return clusters
}

async function buildAiDailyBrief(clusters: EventCluster[]) {
  const model = resolveAgentModel()
  if (!model || clusters.length === 0) return null

  try {
    const payload = clusters.slice(0, 12).map((cluster) => ({
      severity: cluster.severity,
      source: cluster.source,
      code: cluster.code,
      currentCount: cluster.currentCount,
      priorCount: cluster.priorCount,
      newSinceYesterday: cluster.isNewSinceYesterday,
      endpoints: cluster.endpoints.slice(0, 4),
      likelyCauseHint: cluster.likelyCause,
    }))

    const { object } = await generateObject({
      model: model as any,
      temperature: 0.2,
      schema: BriefSchema,
      system:
        "You are a production incident triage analyst. Use only provided cluster data. Do not invent errors or causes.",
      prompt: `Summarize today's production anomalies in a short daily brief.\n\nClusters:\n${JSON.stringify(payload, null, 2)}`,
    })

    return object
  } catch (error) {
    console.warn("Log anomaly AI brief generation failed:", error)
    return null
  }
}

export async function runLogAnomalyAgent(input?: {
  triggerSource?: string
  dryRun?: boolean
}) {
  const dryRun = Boolean(input?.dryRun)
  const runId = dryRun
    ? "dry-run"
    : await startAgentRun({
        agentName: "log-anomaly-agent",
        triggerSource: input?.triggerSource || "manual",
        tenantScope: "all",
        metadata: { dryRun },
      })

  try {
    const rangeStart = new Date(Date.now() - 2 * DAY_MS).toISOString()
    const events = await fetchAnomalyEvents(rangeStart)
    const clusters = buildClusters(events)
    const aiBrief = await buildAiDailyBrief(clusters)
    const suppressedOperationalAlertCandidates = clusters.filter(
      (cluster) => (cluster.isNewSinceYesterday || cluster.severity === "critical") && isKnownBenignCluster(cluster),
    )
    const alertClusters = clusters.filter(
      (cluster) => (cluster.isNewSinceYesterday || cluster.severity === "critical") && !isKnownBenignCluster(cluster),
    )

    const summary = {
      dryRun,
      totalEventsScanned: events.length,
      totalClusters: clusters.length,
      newSinceYesterday: clusters.filter((cluster) => cluster.isNewSinceYesterday).length,
      criticalClusters: clusters.filter((cluster) => cluster.severity === "critical").length,
      highClusters: clusters.filter((cluster) => cluster.severity === "high").length,
      alertClusterCount: alertClusters.length,
      suppressedOperationalAlertCandidates: suppressedOperationalAlertCandidates.length,
      topClusters: clusters.slice(0, 5).map((cluster) => ({
        fingerprint: cluster.fingerprint,
        severity: cluster.severity,
        currentCount: cluster.currentCount,
        priorCount: cluster.priorCount,
        newSinceYesterday: cluster.isNewSinceYesterday,
      })),
      aiBrief,
    } as Record<string, any>

    if (!dryRun && alertClusters.length > 0) {
      const lines = alertClusters.slice(0, 20).map((cluster) => {
        const tags = [
          cluster.severity.toUpperCase(),
          cluster.isNewSinceYesterday ? "NEW" : "ONGOING",
          `${cluster.currentCount}x`,
        ].join(" | ")
        const endpoint = cluster.endpoints[0] || "unknown endpoint"
        return `[${tags}] ${cluster.source}:${cluster.code} @ ${endpoint} :: ${truncate(cluster.likelyCause)}`
      })

      const text = [
        `FarmFlow Log Anomaly Agent detected ${alertClusters.length} cluster(s) requiring attention.`,
        `Run ID: ${runId}`,
        `Total clusters this run: ${clusters.length}`,
        `New since yesterday: ${clusters.filter((cluster) => cluster.isNewSinceYesterday).length}`,
        "",
        ...lines,
      ].join("\n")

      const emailResult = await sendAgentAlertEmail({
        subject: `[FarmFlow] Log Anomaly Alerts (${alertClusters.length})`,
        text,
      })
      summary.emailNotification = emailResult
    } else {
      summary.emailNotification = {
        sent: false,
        provider: "none",
        reason: dryRun ? "dry-run" : "no new or critical clusters",
      }
    }

    if (!dryRun) {
      for (const cluster of clusters.slice(0, 100)) {
        await saveAgentFinding({
          runId,
          tenantId: cluster.tenants[0] || null,
          findingType: "log_anomaly_cluster",
          findingKey: cluster.fingerprint,
          severity: cluster.severity,
          title: `${cluster.source}:${cluster.code} (${cluster.currentCount})`,
          description: cluster.likelyCause,
          payload: {
            source: cluster.source,
            code: cluster.code,
            message: cluster.message,
            endpoints: cluster.endpoints,
            currentCount: cluster.currentCount,
            priorCount: cluster.priorCount,
            isNewSinceYesterday: cluster.isNewSinceYesterday,
            latestOccurrence: cluster.latestOccurrence,
          },
        })
      }
      await finishAgentRun({
        runId,
        status: "success",
        summary,
      })
    }

    return { runId, summary, clusters }
  } catch (error) {
    if (!dryRun) {
      await finishAgentRun({
        runId,
        status: "failed",
        summary: { error: String((error as Error)?.message || error) },
      })
    }
    throw error
  }
}
