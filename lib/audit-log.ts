import "server-only"

import type { NeonQueryFunction } from "@neondatabase/serverless"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import type { SessionUser } from "@/lib/server/auth"
import { logSecurityEvent } from "@/lib/server/security-events"

type AuditAction = "create" | "update" | "delete" | "upsert"

type AuditEvent = {
  action: AuditAction
  entityType: string
  entityId?: string | number | null
  before?: unknown
  after?: unknown
}

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const serializeAuditPayload = (payload: unknown) => {
  if (payload === undefined || payload === null) return null
  try {
    return JSON.stringify(payload)
  } catch (error) {
    return JSON.stringify({ value: String(payload) })
  }
}

export async function logAuditEvent(
  client: NeonQueryFunction<boolean, boolean> | null | undefined,
  sessionUser: SessionUser,
  event: AuditEvent,
) {
  if (!client) return

  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const beforeData = serializeAuditPayload(event.before)
  const afterData = serializeAuditPayload(event.after)
  let userId: string | null = null

  try {
    const userRows = await runTenantQuery(
      client,
      tenantContext,
      client`
        SELECT id
        FROM users
        WHERE username = ${sessionUser.username}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    userId = userRows?.[0]?.id ?? null
  } catch (error) {
    if (!isMissingRelation(error, "users")) {
      console.warn("Audit log user lookup failed:", error)
    }
  }

  try {
    await runTenantQuery(
      client,
      tenantContext,
      client`
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          username,
          role,
          action,
          entity_type,
          entity_id,
          before_data,
          after_data
        )
        VALUES (
          ${tenantContext.tenantId},
          ${userId},
          ${sessionUser.username || "system"},
          ${sessionUser.role},
          ${event.action},
          ${event.entityType},
          ${event.entityId ? String(event.entityId) : null},
          ${beforeData},
          ${afterData}
        )
      `,
    )
  } catch (error) {
    if (!isMissingRelation(error, "audit_logs")) {
      console.warn("Audit log write failed:", error)
    }
  }

  await logSecurityEvent({
    tenantId: tenantContext.tenantId,
    actorUsername: sessionUser.username,
    actorRole: sessionUser.role,
    eventType: "data_write",
    severity: "info",
    source: "audit-log",
    metadata: {
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
    },
  })
}
