import "server-only"

import { sql } from "@/lib/server/db"

type AgentRunStatus = "running" | "success" | "failed"
type FindingSeverity = "low" | "medium" | "high" | "critical"

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

export async function startAgentRun(input: {
  agentName: string
  triggerSource: string
  tenantScope?: string
  metadata?: Record<string, unknown>
}) {
  if (!sql) throw new Error("Database not configured")
  try {
    const rowsResult = await sql`
      INSERT INTO agent_runs (
        agent_name,
        trigger_source,
        tenant_scope,
        metadata
      )
      VALUES (
        ${input.agentName},
        ${input.triggerSource},
        ${input.tenantScope || "all"},
        ${JSON.stringify(input.metadata || {})}::jsonb
      )
      RETURNING id
    `
    const rows = Array.isArray(rowsResult) ? rowsResult : []
    return String((rows[0] as any)?.id || "")
  } catch (error) {
    if (isMissingRelation(error, "agent_runs")) {
      throw new Error("agent_runs table missing. Run scripts/54-agent-ops.sql")
    }
    throw error
  }
}

export async function finishAgentRun(input: {
  runId: string
  status: AgentRunStatus
  summary?: Record<string, unknown>
  metadata?: Record<string, unknown>
}) {
  if (!sql) throw new Error("Database not configured")
  try {
    await sql`
      UPDATE agent_runs
      SET
        status = ${input.status},
        completed_at = NOW(),
        summary = ${JSON.stringify(input.summary || {})}::jsonb,
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(input.metadata || {})}::jsonb
      WHERE id = ${input.runId}::uuid
    `
  } catch (error) {
    if (isMissingRelation(error, "agent_runs")) {
      throw new Error("agent_runs table missing. Run scripts/54-agent-ops.sql")
    }
    throw error
  }
}

export async function saveAgentFinding(input: {
  runId: string
  tenantId?: string | null
  findingType: string
  findingKey: string
  severity: FindingSeverity
  title: string
  description: string
  payload?: Record<string, unknown>
}) {
  if (!sql) throw new Error("Database not configured")
  try {
    await sql`
      INSERT INTO agent_run_findings (
        run_id,
        tenant_id,
        finding_type,
        finding_key,
        severity,
        title,
        description,
        payload
      )
      VALUES (
        ${input.runId}::uuid,
        ${input.tenantId || null}::uuid,
        ${input.findingType},
        ${input.findingKey},
        ${input.severity},
        ${input.title},
        ${input.description},
        ${JSON.stringify(input.payload || {})}::jsonb
      )
    `
  } catch (error) {
    if (isMissingRelation(error, "agent_run_findings")) {
      throw new Error("agent_run_findings table missing. Run scripts/54-agent-ops.sql")
    }
    throw error
  }
}

export function isAgentTableMissing(error: unknown) {
  return (
    isMissingRelation(error, "agent_runs") ||
    isMissingRelation(error, "agent_run_findings") ||
    isMissingRelation(error, "app_error_events") ||
    isMissingRelation(error, "data_integrity_exceptions")
  )
}
